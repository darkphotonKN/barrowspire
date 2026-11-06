"use client";

import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { needsEmailVerification } from "@/utils/emailVerification";
import VerificationPanel from "@/components/VerificationPanel";

export default function ProfilePage() {
  const router = useRouter();
  const { memberInfo, isAuthenticated } = useAuthStore();

  // Don't render if not authenticated (middleware handles redirect)
  if (!isAuthenticated || !memberInfo) {
    return (
      <div className="profile-loading">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  // The contract says created_at is an optional protobuf {seconds, nanos}.
  const formatDate = (
    value: string | { seconds?: number; nanos?: number } | undefined,
  ) => {
    if (value === undefined) return "—";
    const dateString =
      typeof value === "object"
        ? new Date(Number(value.seconds ?? 0) * 1000).toISOString()
        : value;
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getStatusLabel = (status: number | undefined) => {
    if (status === undefined) return "Unknown";
    return status === 1 ? "Delver" : status === 2 ? "Warden" : "Unknown";
  };

  return (
    <main className="profile-container">
      {/* Background */}
      <div className="profile-bg" />

      {/* Header */}
      <div className="profile-header">
        <button
          onClick={() => router.push("/game")}
          className="profile-back-btn"
        >
          Back to Game
        </button>
        <h1 className="profile-title">PLAYER PROFILE</h1>
      </div>

      {/* Profile Card */}
      <div className="profile-card">
        {/* User Info */}
        <div className="profile-info">
          <h2 className="profile-name">{memberInfo.name}</h2>
          <p className="profile-email">{memberInfo.email}</p>

          <div className="profile-details">
            <div className="profile-detail-item">
              <span className="profile-detail-label">Rank:</span>
              <span className="profile-detail-value">
                {getStatusLabel(memberInfo.status)}
              </span>
            </div>

            <div className="profile-detail-item">
              <span className="profile-detail-label">Email:</span>
              <span className="profile-detail-value">
                {needsEmailVerification(memberInfo) ? (
                  "Unverified"
                ) : (
                  <span className="verify-status">Verified</span>
                )}
              </span>
            </div>

            <div className="profile-detail-item">
              <span className="profile-detail-label">Sworn:</span>
              <span className="profile-detail-value">
                {formatDate(memberInfo.created_at)}
              </span>
            </div>
          </div>

          {/* FS-V6SFK R36: the same panel the banner opens, until verified. */}
          {needsEmailVerification(memberInfo) && (
            <section className="profile-verify" aria-label="Verify your email">
              <h3 className="profile-verify-title">Verify your email</h3>
              <VerificationPanel />
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
