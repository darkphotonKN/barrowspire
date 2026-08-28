"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { apiClient } from "@/utils/api";
import { BARROW } from "@/utils/theme";

// Stripe Elements renders in a cross-origin iframe, so it cannot read our CSS
// custom properties — its appearance API needs literal values. Per ADR-0013
// those literals still come from a definition site (theme.ts), never from a
// hex typed at the call site. Brass at three opacities, for the input chrome.
const BRASS_BORDER = "rgba(156, 123, 63, 0.3)";
const BRASS_BORDER_STRONG = "rgba(156, 123, 63, 0.6)";
const BRASS_RING = "rgba(156, 123, 63, 0.25)";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
);

const PLAN = {
  name: "The Age of Barrowspire Pro",
  productId: "prod_TxVD6tpLpq1NFf",
  price: "$10.00",
  interval: "month",
  features: [
    "Unlimited match history",
    "Exclusive Pro skins & cosmetics",
    "Priority matchmaking",
    "Ad-free experience",
    "Early access to new content",
  ],
};

function CheckoutForm({
  clientSecret,
  onSuccess,
  onError,
}: {
  clientSecret: string;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [confirming, setConfirming] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = useCallback(() => {
    setPolling(true);
    let attempts = 0;
    const maxAttempts = 12; // 12 * 5s = 60s

    pollingRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await apiClient.checkSubscriptionPermission();
        if (res.has_permission) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setPolling(false);
          onSuccess("Subscription confirmed! You now have Pro access.");
          return;
        }
      } catch {
        // ignore polling errors, keep trying
      }

      if (attempts >= maxAttempts) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        setPolling(false);
        onSuccess(
          "Payment received! Please refresh the page to see your subscription status.",
        );
      }
    }, 5000);
  }, [onSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setConfirming(true);
    onError("");

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    const { error } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: cardElement },
    });

    if (error) {
      onError(error.message || "Payment failed");
      setConfirming(false);
    } else {
      setConfirming(false);
      startPolling();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="sub-payment-form">
      <div className="sub-card-input-wrapper">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: "16px",
                color: BARROW.vellum,
                "::placeholder": { color: BARROW.placeholder },
                iconColor: BARROW.brass,
              },
              invalid: { color: BARROW.oxbloodText, iconColor: BARROW.oxbloodText },
            },
          }}
        />
      </div>
      {polling ? (
        <div className="sub-inline-message sub-info">
          <span className="sub-btn-spinner" /> Confirming subscription...
        </div>
      ) : (
        <button
          type="submit"
          disabled={!stripe || confirming}
          className="sub-btn-primary sub-btn-full"
        >
          {confirming ? (
            <span className="sub-btn-loading">
              <span className="sub-btn-spinner" />
              Confirming...
            </span>
          ) : (
            "Confirm Payment"
          )}
        </button>
      )}
    </form>
  );
}

export default function SubscriptionPage() {
  const { memberInfo, isAuthenticated } = useAuthStore();

  const [subscribing, setSubscribing] = useState(false);
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [hasPermission, setHasPermission] = useState(false);
  const [checkingPermission, setCheckingPermission] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    apiClient
      .checkSubscriptionPermission()
      .then((res) => {
        if (res.has_permission) {
          setHasPermission(true);
        }
      })
      .catch(() => { })
      .finally(() => setCheckingPermission(false));
  }, [isAuthenticated]);

  if (!isAuthenticated || !memberInfo) {
    return (
      <div className="sub-loading">
        <div className="profile-spinner" />
      </div>
    );
  }

  const handleSubscribe = async () => {
    setError("");
    setSuccess("");
    setSubscribing(true);
    try {
      const res = await apiClient.subscribe(PLAN.productId, memberInfo.email ?? "");
      // The gateway sends `client_secret`; this read `clientSecret` and was
      // always undefined. Caught by the generated types (FS-0002).
      const secret = res.result?.client_secret;
      if (!secret) {
        setError("No client secret returned from server");
        setSubscribing(false);
        return;
      }
      setClientSecret(secret);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to subscribe");
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <main className="sub-container">
      <div className="sub-bg" />

      <div className="sub-header">
        <h1 className="sub-title">Subscription</h1>
      </div>

      <div className="sub-card">
        <div className="sub-plan-badge">PRO</div>
        <h2 className="sub-plan-name">{PLAN.name}</h2>

        <div className="sub-plan-price">
          <span className="sub-price-amount">{PLAN.price}</span>
          <span className="sub-price-interval">/ {PLAN.interval}</span>
        </div>

        <ul className="sub-features">
          {PLAN.features.map((feature) => (
            <li key={feature} className="sub-feature-item">
              <svg
                className="sub-check-icon"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
              {feature}
            </li>
          ))}
        </ul>

        {checkingPermission ? (
          <div
            className="sub-btn-primary sub-btn-full"
            style={{ textAlign: "center", opacity: 0.6 }}
          >
            <span className="sub-btn-loading">
              <span className="sub-btn-spinner" />
              Loading...
            </span>
          </div>
        ) : hasPermission ? (
          <div className="sub-inline-message sub-success">
            You are subscribed to The Age of Barrowspire Pro!
          </div>
        ) : !clientSecret ? (
          <button
            onClick={handleSubscribe}
            disabled={subscribing}
            className="sub-btn-primary sub-btn-full"
          >
            {subscribing ? (
              <span className="sub-btn-loading">
                <span className="sub-btn-spinner" />
                Processing...
              </span>
            ) : (
              "Subscribe Now"
            )}
          </button>
        ) : (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: "night",
                variables: {
                  colorPrimary: BARROW.brass,
                  colorBackground: BARROW.umber,
                  colorText: BARROW.vellum,
                  colorDanger: BARROW.oxbloodText,
                  borderRadius: "8px",
                  fontFamily: "inherit",
                },
                rules: {
                  ".Input": {
                    border: `1px solid ${BRASS_BORDER}`,
                    backgroundColor: BARROW.pitch,
                  },
                  ".Input:focus": {
                    border: `1px solid ${BRASS_BORDER_STRONG}`,
                    boxShadow: `0 0 0 2px ${BRASS_RING}`,
                  },
                  ".Label": {
                    color: BARROW.vellumDark,
                  },
                },
              },
            }}
          >
            <CheckoutForm
              clientSecret={clientSecret}
              onSuccess={(msg) => {
                setSuccess(msg);
                setHasPermission(true);
              }}
              onError={setError}
            />
          </Elements>
        )}

        {error && <div className="sub-inline-message sub-error">{error}</div>}
        {success && (
          <div className="sub-inline-message sub-success">{success}</div>
        )}
      </div>
    </main>
  );
}
