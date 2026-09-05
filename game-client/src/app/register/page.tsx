"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fromProblem, userMessage } from "@/utils/apiError";
import { publicClient } from "@/utils/api";


const ParticleAnimation = () => {
  const [randomNumber, setRandomNumber] = useState(0);
  useEffect(() => {
    setRandomNumber(Math.random());
  }, []);
  return (
    <div
      className="login-particle"
      style={{
        left: `${randomNumber * 100}%`,
        animationDelay: `${randomNumber * 5}s`,
        animationDuration: `${3 + randomNumber * 4}s`,
      }}
    />
  );
};

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Please enter your delver name");
      return;
    }

    if (!email.trim()) {
      setError("Please enter email");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);

    try {
      const { data, error, response } = await publicClient.POST("/api/member/signup", {
        body: { name, email, password },
      });

      if (!response.ok || error) {
        // Switch on `code`, never on `detail` — detail is prose, not contract.
        // An unrecognised code falls through to the server's detail (FS-0001).
        //
        // ALREADY_EXISTS finally arrives: signup used to answer 202 before the
        // database was touched, so a duplicate email surfaced as a fifteen-second
        // poll that timed out into "taking longer than expected".
        setError(
          userMessage(fromProblem(response.status, error), {
            ALREADY_EXISTS: "An account with that email already exists.",
            VALIDATION_FAILED: "Please check the details you entered.",
            SERVICE_UNAVAILABLE:
              "Registration is temporarily unavailable. Try again shortly.",
          }),
        );
        return;
      }

      // The 201 body is the member itself, not an envelope. Every field is
      // optional in the generated contract (the gateway emits protobuf
      // omitempty), so a 201 that somehow carried no id is caught here rather
      // than sending someone to sign in to an account that may not exist.
      if (!data?.id) {
        setError("Registration succeeded but returned no account. Please try again.");
        return;
      }

      router.push("/login");
    } catch (err) {
      setError("Connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="login-container">
      {/* 背景格線效果 */}
      <div className="login-grid-bg" />

      {/* 浮動粒子效果 */}
      <div className="login-particles">
        {[...Array(20)].map((_, i) => (
          <ParticleAnimation key={i} />
        ))}
      </div>

      {/* 註冊框 */}
      <div className="login-box">
        {/* 標題 */}
        <div className="login-header">
          <h1 className="login-title">THE AGE OF BARROWSPIRE</h1>
          <p className="login-subtitle">Swear the Oath</p>
        </div>

        {/* 表單 */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-input-group">
            <label htmlFor="name" className="login-label">
              Delver Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="login-input"
              placeholder="Enter delver name..."
              autoComplete="name"
            />
          </div>

          <div className="login-input-group">
            <label htmlFor="email" className="login-label">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="login-input"
              placeholder="Enter email..."
              autoComplete="email"
            />
          </div>

          <div className="login-input-group">
            <label htmlFor="password" className="login-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              placeholder="At least 6 characters..."
              autoComplete="new-password"
            />
          </div>

          {error && <p className="login-error">{error}</p>}

          <button
            type="submit"
            className={`login-button ${isLoading ? "loading" : ""}`}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="login-loading">
                <span className="login-spinner" />
                Taking the oath...
              </span>
            ) : (
              "Take the Oath"
            )}
          </button>
        </form>

        {/* 底部連結 */}
        <div className="login-footer">
          <p>
            Already registered?{" "}
            <a href="/login" className="login-link">
              Sign In
            </a>
          </p>
        </div>
      </div>

      {/* 版本資訊 */}
      <div className="login-version">v0.1 // The Barrow-Deep</div>
    </main>
  );
}
