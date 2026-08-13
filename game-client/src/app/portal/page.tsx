"use client";

import { useRouter } from "next/navigation";
import ParticleText from "@/components/ParticleText";

export default function PortalPage() {
  const router = useRouter();

  return (
    <div className="splash-container">
      <ParticleText />
      <div className="splash-overlay">
        <p className="splash-subtitle">
          One morning the folk looked up, and the Spire simply stood.
        </p>
        <button
          className="splash-enter-btn"
          onClick={() => router.push("/login")}
        >
          ENTER THE BARROW
        </button>
      </div>
    </div>
  );
}
