'use client';

import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';

export default function Home() {
  const { isAuthenticated } = useAuthStore();

  return (
    <main className="min-h-screen bg-[#0d0b0a] text-white overflow-x-hidden">

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 sm:px-12 pt-16">
        {/* Background glow layers */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 70% 50% at 50% 35%, rgba(156, 123, 63,0.05) 0%, transparent 60%)',
        }} />
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 40% 30% at 50% 70%, rgba(111, 143, 74,0.02) 0%, transparent 60%)',
        }} />

        <p className="relative text-[11px] text-[#6f8f4a] tracking-[0.4em] uppercase mb-6 font-medium">
          Delve the barrow-deep // Few return whole
        </p>
        <h1
          className="relative text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold font-display text-[#e8a14d] mb-6"
          style={{ letterSpacing: '0.12em' }}
        >
          THE ERA OF BARROWSPIRE
        </h1>
        <p className="relative text-lg sm:text-xl text-[#4a4a44] max-w-xl leading-relaxed tracking-wide mb-12">
          Descend into the barrows beneath the Spire. Strip blade, mail, and draught from the long-dead. Cut down rival delvers -- or find the way back to the light.
        </p>
        <p className="relative text-sm text-[#6f6647] mb-12 tracking-wider">
          Only those who climb back out keep their spoils.
        </p>

        <div className="relative">
          {!isAuthenticated ? (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/register"
                className="px-10 py-3.5 text-sm font-bold text-[#0d0b0a] bg-[#e8a14d] rounded-md hover:brightness-110 hover:scale-[1.02] transition-all duration-300 uppercase tracking-[0.2em]"
              >
                Take the Oath
              </Link>
              <Link
                href="/login"
                className="px-10 py-3.5 text-sm font-bold text-[#4a4a44] border border-[#e8a14d]/20 rounded-md hover:bg-[#e8a14d]/5 hover:border-[#e8a14d]/40 hover:text-[#e8a14d] transition-all duration-300 uppercase tracking-[0.2em]"
              >
                Enter
              </Link>
            </div>
          ) : (
            <Link
              href="/game"
              className="px-12 py-3.5 text-sm font-bold text-[#0d0b0a] bg-[#e8a14d] rounded-md hover:brightness-110 hover:scale-[1.02] transition-all duration-300 uppercase tracking-[0.2em]"
            >
              Delve
            </Link>
          )}
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-30 animate-pulse">
          <span className="text-[10px] tracking-[0.3em] uppercase text-[#8a7d5c]">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-[#8a7d5c] to-transparent" />
        </div>
      </section>

      {/* ── What is The Era of Barrowspire ── */}
      <section className="max-w-4xl mx-auto px-6 sm:px-12 py-28">
        <SectionLabel>About</SectionLabel>
        <SectionTitle>What is The Era of Barrowspire?</SectionTitle>
        <p className="text-center text-[#4a4a44] max-w-2xl mx-auto leading-[1.9] text-base tracking-wide">
          The Era of Barrowspire is a real-time multiplayer dungeon-delve. You descend as a delver into the barrows beneath the Spire, strip randomized spoils from the dead, fight rival delvers, and race back to the surface before the dark claims you. Every delve is different. Every choice may be your last. Server-authoritative, skill-based, and unforgiving.
        </p>
      </section>

      <Divider />

      {/* ── Core Mechanics ── */}
      <section className="max-w-5xl mx-auto px-6 sm:px-12 lg:px-16 py-28">
        <SectionLabel>Systems</SectionLabel>
        <SectionTitle>Core Mechanics</SectionTitle>

        <div className="grid md:grid-cols-3 gap-6">
          <MechanicCard
            title="BLADE & BLOOD"
            description="Server-authoritative hit detection. Attack, take damage, and eliminate opponents — all synced at 30 ticks per second."
            color="cyan"
          />
          <MechanicCard
            title="PLUNDER & ESCAPE"
            description="Break open coffers for randomized blades, mail, and draughts. Work the old mechanisms, unseal the way out, and climb back to the surface with your haul."
            color="magenta"
          />
          <MechanicCard
            title="THE DELVER ROLL"
            description="Delve against rivals. Every kill, death, and escape is carved into the roll. Climb the ranks of the delvers who lived."
            color="cyan"
          />
        </div>
      </section>

      <Divider variant="magenta" />

      {/* ── Gear & Items ── */}
      <section className="max-w-5xl mx-auto px-6 sm:px-12 lg:px-16 py-28">
        <SectionLabel>Arsenal</SectionLabel>
        <SectionTitle>Gear System</SectionTitle>
        <p className="text-sm text-[#8a7d5c] text-center max-w-lg mx-auto mb-16 tracking-wide leading-relaxed">
          Every coffer yields randomized spoils from the hoard — 40% weapons, 35% armor, 25% consumables. Four rarity tiers from common to legendary.
        </p>

        <div className="grid sm:grid-cols-3 gap-6">
          <GearCard
            title="WEAPONS"
            items={['Attack Power scaling', 'Critical Rate (0-100%)', 'Types: Sword, Axe, Bow']}
            color="cyan"
          />
          <GearCard
            title="ARMOR"
            items={['Defense Rating', 'Magic Resistance', 'Slots: Head, Chest, Legs, Gloves, Shield']}
            color="magenta"
          />
          <GearCard
            title="CONSUMABLES"
            items={['Health restoration', 'Mana restoration', 'Timed buffs with duration']}
            color="cyan"
          />
        </div>

        <div className="flex justify-center gap-4 mt-14 flex-wrap">
          {(['Common', 'Rare', 'Epic', 'Legendary'] as const).map((rarity) => (
            <RarityBadge key={rarity} rarity={rarity} />
          ))}
        </div>
      </section>

      <Divider />

      {/* ── How a Match Works ── */}
      <section className="max-w-5xl mx-auto px-6 sm:px-12 lg:px-16 py-28">
        <SectionLabel>Match Flow</SectionLabel>
        <SectionTitle>How It Works</SectionTitle>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <StepCard step="01" title="GATHER" description="Find a delve. Delvers are paired and sent down into a shared barrow." />
          <StepCard step="02" title="PLUNDER" description="Break open coffers for randomized spoils. Don blade and mail to gain an edge." />
          <StepCard step="03" title="FIGHT" description="Engage other operators. Every elimination is tracked — kills, deaths, positioning." />
          <StepCard step="04" title="ESCAPE" description="Work the old mechanisms to unseal the way out. Climb out to keep your spoils and your name." />
        </div>
      </section>

      <Divider variant="magenta" />

      {/* ── Controls ── */}
      <section className="max-w-3xl mx-auto px-6 sm:px-12 lg:px-16 py-28">
        <SectionLabel>Controls</SectionLabel>
        <SectionTitle>Delver Controls</SectionTitle>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-md mx-auto">
          <ControlKey keys="WASD" label="Move" />
          <ControlKey keys="SPACE" label="Strike" />
          <ControlKey keys="E" label="Interact" />
          <ControlKey keys="F" label="Plunder" />
          <ControlKey keys="I" label="Pack" />
          <ControlKey keys="ESC" label="Close Menu" />
        </div>
      </section>

      <Divider />

      {/* ── CTA ── */}
      <section className="relative max-w-3xl mx-auto px-6 sm:px-12 lg:px-16 py-32 text-center">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(156, 123, 63,0.03) 0%, transparent 70%)',
        }} />

        <h2
          className="relative text-3xl sm:text-4xl font-bold font-display text-[#e8a14d] mb-6 tracking-[0.1em]"
          style={{ }}
        >
          ENTER THE BARROW
        </h2>
        <p className="relative text-base text-[#8a7d5c] max-w-sm mx-auto mb-12 tracking-wide leading-relaxed">
          Swear the oath. Take up your torch. Few return whole -- fewer return rich.
        </p>

        {!isAuthenticated ? (
          <div className="relative flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="px-10 py-3.5 text-sm font-bold text-[#0d0b0a] bg-[#e8a14d] rounded-md hover:brightness-110 hover:scale-[1.02] transition-all duration-300 uppercase tracking-[0.2em]"
            >
              Take the Oath
            </Link>
            <Link
              href="/leaderboard"
              className="px-10 py-3.5 text-sm font-bold text-[#4a4a44] border border-[#e8a14d]/20 rounded-md hover:bg-[#e8a14d]/5 hover:border-[#e8a14d]/40 hover:text-[#e8a14d] transition-all duration-300 uppercase tracking-[0.2em]"
            >
              View Rankings
            </Link>
          </div>
        ) : (
          <div className="relative flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/game"
              className="px-12 py-3.5 text-sm font-bold text-[#0d0b0a] bg-[#e8a14d] rounded-md hover:brightness-110 hover:scale-[1.02] transition-all duration-300 uppercase tracking-[0.2em]"
            >
              Delve
            </Link>
            <Link
              href="/leaderboard"
              className="px-10 py-3.5 text-sm font-bold text-[#4a4a44] border border-[#e8a14d]/20 rounded-md hover:bg-[#e8a14d]/5 hover:border-[#e8a14d]/40 hover:text-[#e8a14d] transition-all duration-300 uppercase tracking-[0.2em]"
            >
              View Rankings
            </Link>
          </div>
        )}
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#e8a14d]/10 py-10 px-6 sm:px-12">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <span className="text-[11px] text-[#5a5238] tracking-[0.2em] uppercase">
            v0.1 // The Barrow-Deep // The Era of Barrowspire
          </span>
          <div className="flex gap-8">
            <Link href="/leaderboard" className="text-[11px] text-[#6f6647] hover:text-[#e8a14d] tracking-[0.15em] uppercase transition-colors">
              Rankings
            </Link>
            <Link href="/subscription" className="text-[11px] text-[#6f6647] hover:text-[#e8a14d] tracking-[0.15em] uppercase transition-colors">
              Premium
            </Link>
            <Link href="/profile" className="text-[11px] text-[#6f6647] hover:text-[#e8a14d] tracking-[0.15em] uppercase transition-colors">
              Profile
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

/* ── Shared Section Components ── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] text-[#6f8f4a] tracking-[0.35em] uppercase mb-4 text-center font-medium">
      {children}
    </p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-2xl sm:text-3xl font-bold font-display text-center text-[#e8a14d] mb-16 tracking-[0.1em] uppercase"
      style={{ }}
    >
      {children}
    </h2>
  );
}

function Divider({ variant = 'cyan' }: { variant?: 'cyan' | 'magenta' }) {
  const color = variant === 'cyan' ? 'rgba(156, 123, 63,0.12)' : 'rgba(111, 143, 74,0.08)';
  return (
    <div className="max-w-xl mx-auto px-6 sm:px-12">
      <div className="h-px" style={{ background: `linear-gradient(to right, transparent, ${color}, transparent)` }} />
    </div>
  );
}

/* ── Card Components ── */

function MechanicCard({ title, description, color }: { title: string; description: string; color: 'cyan' | 'magenta' }) {
  const isCyan = color === 'cyan';
  const borderColor = isCyan ? 'rgba(156, 123, 63,0.1)' : 'rgba(111, 143, 74,0.1)';
  const titleColor = isCyan ? '#e8a14d' : '#6f8f4a';
  const hoverBorder = isCyan ? 'hover:border-[#e8a14d]/25' : 'hover:border-[#6f8f4a]/25';
  const bgGlow = isCyan
    ? 'radial-gradient(ellipse at 50% 0%, rgba(156, 123, 63,0.03) 0%, transparent 70%)'
    : 'radial-gradient(ellipse at 50% 0%, rgba(111, 143, 74,0.02) 0%, transparent 70%)';

  return (
    <div
      className={`p-7 rounded-lg border transition-all duration-300 ${hoverBorder}`}
      style={{ borderColor, background: bgGlow }}
    >
      <h3 className="text-sm font-bold tracking-[0.15em] mb-4" style={{ color: titleColor }}>
        {title}
      </h3>
      <p className="text-[13px] text-[#4a4a44] leading-[1.9]">
        {description}
      </p>
    </div>
  );
}

function GearCard({ title, items, color }: { title: string; items: string[]; color: 'cyan' | 'magenta' }) {
  const isCyan = color === 'cyan';
  const borderColor = isCyan ? 'rgba(156, 123, 63,0.1)' : 'rgba(111, 143, 74,0.1)';
  const titleColor = isCyan ? '#e8a14d' : '#6f8f4a';
  const dotColor = isCyan ? 'bg-[#e8a14d]/50' : 'bg-[#6f8f4a]/50';
  const bgGlow = isCyan
    ? 'radial-gradient(ellipse at 50% 0%, rgba(156, 123, 63,0.03) 0%, transparent 70%)'
    : 'radial-gradient(ellipse at 50% 0%, rgba(111, 143, 74,0.02) 0%, transparent 70%)';

  return (
    <div
      className="p-7 rounded-lg border transition-all duration-300"
      style={{ borderColor, background: bgGlow }}
    >
      <h3 className="text-sm font-bold tracking-[0.15em] mb-5" style={{ color: titleColor }}>
        {title}
      </h3>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-[13px] text-[#4a4a44] leading-relaxed">
            <span className={`w-1 h-1 rounded-full mt-2 flex-shrink-0 ${dotColor}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepCard({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div className="p-6 rounded-lg border border-[#e8a14d]/10" style={{
      background: 'radial-gradient(ellipse at 50% 0%, rgba(156, 123, 63,0.02) 0%, transparent 70%)',
    }}>
      <span className="text-[10px] text-[#6f6647] tracking-[0.25em] font-bold">{step}</span>
      <h3 className="text-sm font-bold text-[#e8a14d] tracking-[0.12em] mt-3 mb-3">{title}</h3>
      <p className="text-[13px] text-[#8a7d5c] leading-[1.8]">{description}</p>
    </div>
  );
}

function ControlKey({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-3 p-3.5 rounded-md border border-[#e8a14d]/10 bg-[#e8a14d]/[0.02]">
      <kbd className="text-xs font-bold text-[#e8a14d] tracking-[0.1em] font-mono bg-[#e8a14d]/5 px-2.5 py-1.5 rounded border border-[#e8a14d]/15 min-w-[48px] text-center">
        {keys}
      </kbd>
      <span className="text-xs text-[#4a4a44] tracking-wide">{label}</span>
    </div>
  );
}

const rarityColors = {
  Common: { text: '#4a4a44', border: 'rgba(102,119,136,0.25)', bg: 'rgba(102,119,136,0.06)' },
  Rare: { text: '#e8a14d', border: 'rgba(156, 123, 63,0.25)', bg: 'rgba(156, 123, 63,0.06)' },
  Epic: { text: '#bf5fff', border: 'rgba(191,95,255,0.25)', bg: 'rgba(191,95,255,0.06)' },
  Legendary: { text: '#6f8f4a', border: 'rgba(111, 143, 74,0.25)', bg: 'rgba(111, 143, 74,0.06)' },
} as const;

function RarityBadge({ rarity }: { rarity: keyof typeof rarityColors }) {
  const c = rarityColors[rarity];
  return (
    <span
      className="text-[11px] font-bold tracking-[0.15em] uppercase px-4 py-2 rounded"
      style={{ color: c.text, border: `1px solid ${c.border}`, background: c.bg }}
    >
      {rarity}
    </span>
  );
}
