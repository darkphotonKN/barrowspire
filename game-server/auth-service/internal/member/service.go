package member

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/auth"
	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/models"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	commonbroker "github.com/darkphotonKN/barrowspire-server/common/broker"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"go.opentelemetry.io/otel/codes"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type service struct {
	db              *sqlx.DB
	Repo            Repository
	publishCh       commonbroker.Publisher
	outboxPublisher commonoutbox.OutboxPublisher
	passwordPolicy  PasswordPolicy
	codeIssuer      VerificationCodeIssuer
	verifier        EmailVerifier
}

// PasswordPolicy is the rule a password must meet when it is set. Check
// answers a domain refusal (errcode.Refuse) for a password it rejects.
type PasswordPolicy interface {
	Check(password string) error
}

// VerificationCodeIssuer issues a member's verification code and queues its
// mail inside the caller's transaction (FS-V6SFK §Requirements 14, 16).
type VerificationCodeIssuer interface {
	IssueTx(ctx context.Context, tx *sqlx.Tx, to Recipient) error
}

// EmailVerifier moves a member from unverified to verified: checking a code,
// resending one, changing the address while unverified (FS-V6SFK
// §Requirements 17-19). Refusals come back as errcode refusals.
type EmailVerifier interface {
	Verify(ctx context.Context, memberID uuid.UUID, code string) (*models.Member, error)
	Resend(ctx context.Context, memberID uuid.UUID) error
	ChangeEmail(ctx context.Context, memberID uuid.UUID, email string) (*models.Member, error)
}

type Repository interface {
	Create(ctx context.Context, name, email, password string) (uuid.UUID, error)
	CreateTx(ctx context.Context, tx *sqlx.Tx, name, email, password string) (uuid.UUID, error)
	UpdatePassword(ctx context.Context, params MemberUpdatePasswordParams) error
	UpdateMemberInfo(ctx context.Context, id uuid.UUID, name, status string) error
	GetByIdWithPassword(ctx context.Context, id uuid.UUID) (*models.Member, error)
	GetById(ctx context.Context, id uuid.UUID) (*models.Member, error)
	GetMemberByEmail(ctx context.Context, email string) (*models.Member, error)
	CreateDefaultMembers(ctx context.Context, members []CreateDefaultMember) error
	GetStripeCustomerID(ctx context.Context, memberID uuid.UUID) (string, error)
	SetStripeCustomerID(ctx context.Context, memberID uuid.UUID, customerID string) error
	UpdateSubscriptionStatus(ctx context.Context, memberID uuid.UUID, productID, status string) error
}

func NewService(db *sqlx.DB, repo Repository, publishCh commonbroker.Publisher, outboxPublisher commonoutbox.OutboxPublisher, passwordPolicy PasswordPolicy, codeIssuer VerificationCodeIssuer, verifier EmailVerifier) *service {
	return &service{
		db:              db,
		Repo:            repo,
		publishCh:       publishCh,
		outboxPublisher: outboxPublisher,
		passwordPolicy:  passwordPolicy,
		codeIssuer:      codeIssuer,
		verifier:        verifier,
	}
}

func memberToProto(m *models.Member) *pb.Member {
	if m == nil {
		return nil
	}

	return &pb.Member{
		Id:            m.ID.String(),
		Name:          m.Name,
		Email:         m.Email,
		Status:        int32(stringToInt(m.Status)),
		AverageRating: float32(m.AverageRating),
		CreatedAt:     timestamppb.New(m.CreatedAt),
		UpdatedAt:     timestamppb.New(m.UpdatedAt),
		Role:          m.Role,
		EmailVerified: m.EmailVerifiedAt != nil,
	}
}

func stringToInt(s string) int {
	i, err := strconv.Atoi(s)
	if err != nil {
		return 0
	}
	return i
}

func (s *service) GetMember(ctx context.Context, req *pb.GetMemberRequest) (*pb.Member, error) {
	id, err := uuid.Parse(req.Id)
	if err != nil {
		return nil, fmt.Errorf("invalid UUID: %w", err)
	}

	member, err := s.Repo.GetById(ctx, id)
	if err != nil {
		return nil, err
	}

	return memberToProto(member), nil
}

func (s *service) CreateMember(ctx context.Context, req *pb.CreateMemberRequest) (*pb.Member, error) {

	// span for entire function
	ctx, span := serviceTracer.Start(ctx, "service.CreateMember")
	defer span.End()

	// Both are refusals the caller fixes by changing the request, so they run
	// before any hashing or database work (FS-V6SFK §Requirements 2, 6-7).
	email, err := NormalizeEmail(req.Email)
	if err != nil {
		return nil, err
	}
	if err := s.passwordPolicy.Check(req.Password); err != nil {
		return nil, err
	}

	// span just for password
	ctx, hashSpan := serviceTracer.Start(ctx, "service.HashPassword")
	// hash the password
	hashedPw, err := s.HashPassword(req.Password)
	hashSpan.End()

	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "password hashing failed")
		return nil, fmt.Errorf("error hashing password: %w", err)
	}

	// Build the outbox payload up-front so a marshal failure aborts before
	// we open a transaction.
	payload := commonconstants.MemberSignedUpEventPayload{
		EventID:    uuid.NewString(),
		UserID:     "", // filled in after member row is created
		Name:       req.Name,
		Email:      email,
		SignedUpAt: "", // TODO: update this to legit date
	}

	// Atomic write: member row + outbox row share a single transaction so
	// either both are visible or neither is. This is the core guarantee of
	// the transactional outbox pattern, without it, an RPC can succeed
	// while the event is lost (or vice versa)
	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	// Safety net: if we return before Commit, roll back. Commit below
	// makes this a no-op.
	defer func() {
		_ = tx.Rollback()
	}()

	memberId, err := s.Repo.CreateTx(ctx, tx, req.Name, email, hashedPw)
	if err != nil {
		return nil, err
	}

	payload.UserID = memberId.String()
	marshalledPayload, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	if err = s.outboxPublisher.CreateOutboxTx(ctx, tx, commonoutbox.OutboxParams{
		RoutingKey: commonconstants.MemberSignedUpEvent,
		Exchange:   commonconstants.AuthEventsExchange,
		Payload:    marshalledPayload,
	}); err != nil {
		return nil, fmt.Errorf("write outbox: %w", err)
	}

	// The verification code rides the same transaction, so a member never
	// commits without one and no code is mailed for a rolled-back signup
	// (FS-V6SFK §Requirements 14).
	if err = s.codeIssuer.IssueTx(ctx, tx, Recipient{MemberID: memberId, Name: req.Name, Email: email}); err != nil {
		return nil, fmt.Errorf("issue verification code: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit member+outbox: %w", err)
	}

	// Post-commit read: member is guaranteed to exist. A failure here
	// does not affect the event — the outbox row is already durable and
	// the worker will publish it.
	member, err := s.Repo.GetById(ctx, memberId)
	if err != nil {
		return nil, err
	}

	return memberToProto(member), nil
}

func (s *service) LoginMember(ctx context.Context, req *pb.LoginRequest) (*pb.LoginResponse, error) {
	// Normalized, never validated: a malformed address simply matches no one.
	// Login never applies the password policy either, so a password set before
	// it existed keeps working (FS-V6SFK §Requirements 3, 6).
	member, err := s.Repo.GetMemberByEmail(ctx, normalizedEmail(req.Email))
	if err != nil {
		// Deliberately NOT ErrNotFound. Propagating it makes "no such account"
		// answer 404 while a wrong password answers 401 — which tells an attacker
		// exactly which emails are registered. The two failures must be one
		// failure to the caller. The real cause is logged, not returned.
		slog.InfoContext(ctx, "login failed at member lookup", "error", err)
		return nil, commonconstants.ErrUnauthorized
	}

	if err = bcrypt.CompareHashAndPassword([]byte(member.Password), []byte(req.Password)); err != nil {
		return nil, commonconstants.ErrUnauthorized
	}

	return tokenPair(member)
}

// tokenPair mints an access and refresh token for member and returns them with
// the member. The claims are read off member, so it must be the row as it is
// now: verify passes the member it just verified (FS-V6SFK §Requirements 21).
func tokenPair(member *models.Member) (*pb.LoginResponse, error) {
	accessExpiryTime := time.Minute * 60
	refreshExpiryTime := time.Hour * 24 * 7

	accessToken, err := auth.GenerateJWT(*member, commonconstants.Access, accessExpiryTime)
	if err != nil {
		return nil, fmt.Errorf("error generating access token: %w", err)
	}

	refreshToken, err := auth.GenerateJWT(*member, commonconstants.Refresh, refreshExpiryTime)
	if err != nil {
		return nil, fmt.Errorf("error generating refresh token: %w", err)
	}

	return &pb.LoginResponse{
		AccessToken:      accessToken,
		RefreshToken:     refreshToken,
		AccessExpiresIn:  int32(accessExpiryTime.Seconds()),
		RefreshExpiresIn: int32(refreshExpiryTime.Seconds()),
		MemberInfo:       memberToProto(member),
	}, nil
}

// VerifyEmail verifies the member with their code and hands back a fresh
// token pair, so the access token carries the claim without a new login. An
// already-verified member gets a fresh pair too (FS-V6SFK §Requirements 17).
func (s *service) VerifyEmail(ctx context.Context, req *pb.VerifyEmailRequest) (*pb.LoginResponse, error) {
	id, err := uuid.Parse(req.Id)
	if err != nil {
		return nil, fmt.Errorf("invalid UUID: %w", err)
	}

	member, err := s.verifier.Verify(ctx, id, req.Code)
	if err != nil {
		return nil, err
	}

	return tokenPair(member)
}

// ResendVerification issues the member a new code (FS-V6SFK §Requirements 18).
func (s *service) ResendVerification(ctx context.Context, req *pb.ResendVerificationRequest) (*pb.ResendVerificationResponse, error) {
	id, err := uuid.Parse(req.Id)
	if err != nil {
		return nil, fmt.Errorf("invalid UUID: %w", err)
	}

	if err := s.verifier.Resend(ctx, id); err != nil {
		return nil, err
	}

	return &pb.ResendVerificationResponse{}, nil
}

// ChangeUnverifiedEmail moves an unverified member to a new address and mails
// it a code (FS-V6SFK §Requirements 19).
func (s *service) ChangeUnverifiedEmail(ctx context.Context, req *pb.ChangeUnverifiedEmailRequest) (*pb.Member, error) {
	id, err := uuid.Parse(req.Id)
	if err != nil {
		return nil, fmt.Errorf("invalid UUID: %w", err)
	}

	member, err := s.verifier.ChangeEmail(ctx, id, req.Email)
	if err != nil {
		return nil, err
	}

	return memberToProto(member), nil
}

// UpdateMemberInfo implements the gRPC UpdateMemberInfo method
func (s *service) UpdateMemberInfo(ctx context.Context, req *pb.UpdateMemberInfoRequest) (*pb.Member, error) {
	id, err := uuid.Parse(req.Id)
	if err != nil {
		return nil, fmt.Errorf("invalid UUID: %w", err)
	}

	// Update member info
	err = s.Repo.UpdateMemberInfo(ctx, id, req.Name, req.Status)
	if err != nil {
		return nil, err
	}

	// Get the updated member
	member, err := s.Repo.GetById(ctx, id)
	if err != nil {
		return nil, err
	}

	return memberToProto(member), nil
}

func (s *service) UpdateMemberPassword(ctx context.Context, req *pb.UpdatePasswordRequest) (*pb.UpdatePasswordResponse, error) {
	id, err := uuid.Parse(req.Id)
	if err != nil {
		return nil, fmt.Errorf("invalid UUID: %w", err)
	}

	// Get the member with password
	member, err := s.Repo.GetByIdWithPassword(ctx, id)
	if err != nil {
		return nil, err
	}

	// Check if new passwords match
	if req.NewPassword != req.RepeatNewPassword {
		return &pb.UpdatePasswordResponse{
			Success: false,
			Message: "New passwords do not match",
		}, errors.New("new passwords do not match")
	}

	// Verify current password
	isSame, err := s.ComparePasswords(member.Password, req.CurrentPassword)
	if !isSame || err != nil {
		return &pb.UpdatePasswordResponse{
			Success: false,
			Message: "Current password is incorrect",
		}, errors.New("current password is incorrect")
	}

	// The policy checks the new password only after the existing checks pass
	// (FS-V6SFK §Requirements 2, 5).
	if err := s.passwordPolicy.Check(req.NewPassword); err != nil {
		return nil, err
	}

	// Hash the new password
	hashedPw, err := s.HashPassword(req.NewPassword)
	if err != nil {
		return &pb.UpdatePasswordResponse{
			Success: false,
			Message: "Error hashing password",
		}, fmt.Errorf("error hashing password: %w", err)
	}

	// Update the password in the database
	params := MemberUpdatePasswordParams{
		ID:       id,
		Password: hashedPw,
	}

	err = s.Repo.UpdatePassword(ctx, params)
	if err != nil {
		return &pb.UpdatePasswordResponse{
			Success: false,
			Message: "Error updating password",
		}, err
	}

	return &pb.UpdatePasswordResponse{
		Success: true,
		Message: "Password updated successfully",
	}, nil
}

func (s *service) ValidateToken(ctx context.Context, req *pb.ValidateTokenRequest) (*pb.ValidateTokenResponse, error) {
	// validate the token using auth package
	claims, err := auth.ValidateJWT(req.Token)
	if err != nil {
		return &pb.ValidateTokenResponse{
			Valid:    false,
			MemberId: "",
		}, err
	}

	return &pb.ValidateTokenResponse{
		Valid:    true,
		MemberId: claims.ID,
	}, nil
}

// Helper functions

// HashPassword hashes the given password using bcrypt.
func (s *service) HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// ComparePasswords compares a hashed password with a plain text password.
func (s *service) ComparePasswords(storedPassword string, inputPassword string) (bool, error) {
	err := bcrypt.CompareHashAndPassword([]byte(storedPassword), []byte(inputPassword))
	if err != nil {
		if errors.Is(err, bcrypt.ErrMismatchedHashAndPassword) {
			return false, nil // Passwords do not match
		}
		return false, err // Other error
	}
	return true, nil // Passwords match
}

/**
* Create Default Members.
**/
func (s *service) CreateDefaultMembers(members []CreateDefaultMember) error {
	var hashedPwMembers []CreateDefaultMember

	// Update members passwords with hash
	for _, member := range members {
		hashedPw, err := s.HashPassword(member.Password)
		if err != nil {
			return err
		}
		member.Password = hashedPw
		hashedPwMembers = append(hashedPwMembers, member)
	}

	return s.Repo.CreateDefaultMembers(context.Background(), hashedPwMembers)
}

// SetStripeCustomerID saves a Stripe customer ID for the member
func (s *service) SetStripeCustomerID(ctx context.Context, req *pb.SetStripeCustomerIDRequest) (*pb.SetStripeCustomerIDResponse, error) {
	memberID, err := uuid.Parse(req.MemberId)
	if err != nil {
		return nil, fmt.Errorf("invalid member UUID: %w", err)
	}

	if err := s.Repo.SetStripeCustomerID(ctx, memberID, req.StripeCustomerId); err != nil {
		return nil, err
	}

	return &pb.SetStripeCustomerIDResponse{Success: true}, nil
}

// GetStripeCustomerID retrieves the Stripe customer ID for a member
func (s *service) GetStripeCustomerID(ctx context.Context, req *pb.GetStripeCustomerIDRequest) (*pb.GetStripeCustomerIDResponse, error) {
	memberID, err := uuid.Parse(req.MemberId)
	if err != nil {
		return nil, fmt.Errorf("invalid member UUID: %w", err)
	}

	customerID, err := s.Repo.GetStripeCustomerID(ctx, memberID)
	if err != nil {
		return nil, err
	}

	return &pb.GetStripeCustomerIDResponse{StripeCustomerId: customerID}, nil
}

// UpdateSubscriptionStatus updates the member's subscription product and status
func (s *service) UpdateSubscriptionStatus(ctx context.Context, req *pb.UpdateSubscriptionStatusRequest) (*pb.UpdateSubscriptionStatusResponse, error) {
	memberID, err := uuid.Parse(req.MemberId)
	if err != nil {
		return nil, fmt.Errorf("invalid member UUID: %w", err)
	}

	if err := s.Repo.UpdateSubscriptionStatus(ctx, memberID, req.ProductId, req.Status); err != nil {
		return nil, err
	}

	return &pb.UpdateSubscriptionStatusResponse{Success: true}, nil
}

func (s *service) CheckEmailExists(ctx context.Context, req *pb.CheckEmailRequest) (*pb.CheckEmailResponse, error) {
	_, err := s.Repo.GetMemberByEmail(ctx, normalizedEmail(req.Email))
	if err != nil {
		return &pb.CheckEmailResponse{Exists: false}, nil
	}
	return &pb.CheckEmailResponse{Exists: true}, nil
}
