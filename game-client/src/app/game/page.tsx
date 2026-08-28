'use client';

import dynamic from 'next/dynamic';
import { useAuthStore } from '@/stores/authStore';
import Link from 'next/link';

const PhaserGame = dynamic(() => import('@/components/PhaserGame'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg-dark gap-4">
      <p className="text-primary text-3xl font-display font-bold tracking-[0.15em] uppercase" style={{ }}>Lighting the Torch</p>
      <p className="text-vellum-dim text-sm tracking-[0.2em] uppercase">Descending into the barrow...</p>
    </div>
  ),
});

export default function GamePage() {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center space-y-6 p-8 bg-card rounded-lg border border-brass/30 backdrop-blur-sm">
          <h1 className="text-4xl font-bold text-primary font-display">
            Access Restricted
          </h1>
          <p className="text-gray-300 text-lg max-w-md">
            You need to be signed in to delve. Swear the oath, or return to the delve.
          </p>
          <div className="flex gap-4 justify-center pt-4">
            <Link
              href="/login"
              className="px-6 py-3 bg-brass/10 text-primary border border-brass/50 rounded hover:bg-brass/20 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="px-6 py-3 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
            >
              Create Account
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black">
      <div className="flex flex-col items-center justify-center min-h-screen pb-4">
        <PhaserGame />
      </div>
    </main>
  );
}
