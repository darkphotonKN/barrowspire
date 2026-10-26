'use client';

import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import RarityBadge from '@/components/RarityBadge';
import { RARITY_TIERS } from '@/marketplace/rarity';

export default function Home() {
  const { isAuthenticated } = useAuthStore();

  return (
    <main className="min-h-screen bg-bg-dark text-vellum overflow-x-hidden">

      {/* ── Hero ── */}
      <section className="atmo-hero relative min-h-screen flex flex-col items-center justify-center text-center px-6 sm:px-12 pt-16">
        {/* Background glow layers */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 70% 50% at 50% 35%, color-mix(in srgb, var(--color-brass) 5%, transparent) 0%, transparent 60%)',
        }} />
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 40% 30% at 50% 70%, color-mix(in srgb, var(--color-accent) 2%, transparent) 0%, transparent 60%)',
        }} />

        <p className="relative text-[11px] text-accent tracking-[0.4em] uppercase mb-6 font-medium">
          It was not there the night before
        </p>
        <h1
          className="relative text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold font-display text-primary mb-6"
          style={{ letterSpacing: '0.12em' }}
        >
          THE AGE OF BARROWSPIRE
        </h1>
        <p className="relative text-lg sm:text-xl text-vellum-muted max-w-xl leading-relaxed tracking-wide mb-12">
          One grey morning the town woke to a tower standing on the old barrow field. Nobody heard it rise. Its stone is older than the town, and its door was already open.
        </p>
        <p className="relative text-sm text-vellum-muted mb-12 tracking-wider">
          Some who went in came back with gold. Most never came back.
        </p>

        <div className="relative">
          {!isAuthenticated ? (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/register"
                className="atmo-cta px-10 py-3.5 text-sm font-bold text-bg-dark bg-primary rounded-md hover:brightness-110 hover:scale-[1.02] transition-all duration-300 uppercase tracking-[0.2em]"
              >
                Take the Oath
              </Link>
              <Link
                href="/login"
                className="px-10 py-3.5 text-sm font-bold text-vellum-muted border border-brass/30 rounded-md hover:bg-brass/10 hover:border-brass/50 hover:text-brass-bright transition-all duration-300 uppercase tracking-[0.2em]"
              >
                Enter
              </Link>
            </div>
          ) : (
            <Link
              href="/game"
              className="atmo-cta px-12 py-3.5 text-sm font-bold text-bg-dark bg-primary rounded-md hover:brightness-110 hover:scale-[1.02] transition-all duration-300 uppercase tracking-[0.2em]"
            >
              Delve
            </Link>
          )}
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-30 animate-pulse">
          <span className="text-[10px] tracking-[0.3em] uppercase text-vellum-dim">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-vellum-dim to-transparent" />
        </div>
      </section>

      {/* ── What is The Age of Barrowspire ── */}
      <section className="max-w-4xl mx-auto px-6 sm:px-12 py-28">
        <SectionLabel>The Spire</SectionLabel>
        <SectionTitle>What stands over the town</SectionTitle>
        <p className="text-center text-vellum-muted max-w-2xl mx-auto leading-[1.9] text-base tracking-wide">
          The Age of Barrowspire is a co-op dungeon crawl played in real time. The town has learned to live in the Spire&apos;s shadow. The market still opens and the bell still rings, and the Spirewarden keeps a list of everyone who goes through the door. Put your name on it and go in. Inside, the stairs only lead up, yet every floor feels further underground than the one below. Nobody has come back from the top to say what lives there. The town has a name for it, and does not say it aloud.
        </p>
      </section>

      <Divider />

      {/* ── Core Mechanics ── */}
      <section className="max-w-5xl mx-auto px-6 sm:px-12 lg:px-16 py-28">
        <SectionLabel>Inside</SectionLabel>
        <SectionTitle>What the Spire asks of you</SectionTitle>

        <div className="grid md:grid-cols-3 gap-6">
          <MechanicCard
            title="WHAT WALKS THE FLOORS"
            description="Ghouls and trolls hold the halls. Some are elites, older and harder to put down, and their names say so. Every one carries its level above its head, so you know how far out of your depth you are. Now and then something larger answers the noise. The few who saw it call it a demon."
            color="brass"
          />
          <MechanicCard
            title="UP, OR OUT"
            description="The party climbs together or not at all. Each floor up hits harder and pays better, and each one has its own way out, a sealed door with a switch somewhere in the dark that opens it. Leave whenever you like. Leave alive."
            color="arcane"
          />
          <MechanicCard
            title="SWORN TOGETHER"
            description="You go in as a party, and your blades can't touch each other. The Spire does enough. Kills bring experience, and experience lets you wear heavier gear, up to the twentieth level. When you fall, the Spire keeps everything you carried. What you learned, you keep."
            color="brass"
          />
        </div>
      </section>

      <Divider variant="arcane" />

      {/* ── Gear & Items ── */}
      <section className="max-w-5xl mx-auto px-6 sm:px-12 lg:px-16 py-28">
        <SectionLabel>Plunder</SectionLabel>
        <SectionTitle>What the Spire gives up</SectionTitle>
        <p className="text-sm text-vellum-dim text-center max-w-lg mx-auto mb-16 tracking-wide leading-relaxed">
          Relics come out of old coffers and off the things you kill. A relic is as strong as whatever dropped it, so the worst floors pay the best. Everything you put on counts the moment you wear it.
        </p>

        <div className="grid sm:grid-cols-3 gap-6">
          <GearCard
            title="WEAPONS"
            items={['Swords, axes, maces, spears, knives and bows', 'Attack power and the chance of a critical blow', 'Heavier bases only drop on deeper floors']}
            color="brass"
          />
          <GearCard
            title="ARMOR & RINGS"
            items={['Head, chest, legs, gloves and shield', 'Defense against steel, resistance against sorcery', 'Two rings that carry no armor, only power']}
            color="arcane"
          />
          <GearCard
            title="DRAUGHTS"
            items={['Restore health', 'Restore mana', 'Strength that does not last']}
            color="brass"
          />
        </div>

        <div className="flex justify-center gap-4 mt-14 flex-wrap">
          {RARITY_TIERS.map((tier) => (
            <RarityBadge key={tier} tier={tier} />
          ))}
        </div>
        <p className="text-sm text-vellum-dim text-center max-w-lg mx-auto mt-8 tracking-wide leading-relaxed">
          Rarity decides how many enchantments a relic carries. Normal has none, uncommon one, rare two, runed three or four. Fabled relics are not left to chance. There are six of them, and each holds a power no other relic has. Wightfang is one. The Hollow Crown is another.
        </p>
      </section>

      <Divider />

      {/* ── How a Match Works ── */}
      <section className="max-w-5xl mx-auto px-6 sm:px-12 lg:px-16 py-28">
        <SectionLabel>A delve</SectionLabel>
        <SectionTitle>How it goes</SectionTitle>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <StepCard step="01" title="GATHER" description="Find the Spirewarden in the town. You go in with whoever else is waiting at the door." />
          <StepCard step="02" title="PLUNDER" description="Break the coffers open and take what the dead drop. Put it on. You will need it." />
          <StepCard step="03" title="CLIMB" description="Meet at the stairs to go up. Everyone goes, or nobody does. The next floor is worse." />
          <StepCard step="04" title="ESCAPE" description="Find the switch and walk out the sealed door with what you carry. Fall, and the barrow keeps its dead." />
        </div>
      </section>

      <Divider variant="arcane" />

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
          background: 'radial-gradient(ellipse 60% 50% at 50% 50%, color-mix(in srgb, var(--color-brass) 3%, transparent) 0%, transparent 70%)',
        }} />

        <h2
          className="relative text-3xl sm:text-4xl font-bold text-vellum mb-6 tracking-[0.1em]"
          style={{ }}
        >
          THE DOOR IS STILL OPEN
        </h2>
        <p className="relative text-base text-vellum-dim max-w-sm mx-auto mb-12 tracking-wide leading-relaxed">
          The bell tolls once for every party that goes in. It tolls less often for the ones that come out.
        </p>

        {!isAuthenticated ? (
          <div className="relative flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="px-10 py-3.5 text-sm font-bold text-bg-dark bg-primary rounded-md hover:brightness-110 hover:scale-[1.02] transition-all duration-300 uppercase tracking-[0.2em]"
            >
              Take the Oath
            </Link>
            {/* Leaderboard is off for now (the stats service still records finished games).
            <Link
              href="/leaderboard"
              className="px-10 py-3.5 text-sm font-bold text-vellum-muted border border-brass/30 rounded-md hover:bg-brass/10 hover:border-brass/50 hover:text-brass-bright transition-all duration-300 uppercase tracking-[0.2em]"
            >
              View Rankings
            </Link>
            */}
          </div>
        ) : (
          <div className="relative flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/game"
              className="px-12 py-3.5 text-sm font-bold text-bg-dark bg-primary rounded-md hover:brightness-110 hover:scale-[1.02] transition-all duration-300 uppercase tracking-[0.2em]"
            >
              Delve
            </Link>
            {/* Leaderboard is off for now (the stats service still records finished games).
            <Link
              href="/leaderboard"
              className="px-10 py-3.5 text-sm font-bold text-vellum-muted border border-brass/30 rounded-md hover:bg-brass/10 hover:border-brass/50 hover:text-brass-bright transition-all duration-300 uppercase tracking-[0.2em]"
            >
              View Rankings
            </Link>
            */}
          </div>
        )}
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-brass/20 py-10 px-6 sm:px-12">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <span className="text-[11px] text-vellum-muted tracking-[0.2em] uppercase">
            v0.1 // The Barrow-Deep // The Age of Barrowspire
          </span>
          <div className="flex gap-8">
            {/* Leaderboard is off for now.
            <Link href="/leaderboard" className="text-[11px] text-vellum-muted hover:text-brass-bright tracking-[0.15em] uppercase transition-colors">
              Rankings
            </Link>
            */}
            <Link href="/subscription" className="text-[11px] text-vellum-muted hover:text-brass-bright tracking-[0.15em] uppercase transition-colors">
              Premium
            </Link>
            <Link href="/profile" className="text-[11px] text-vellum-muted hover:text-brass-bright tracking-[0.15em] uppercase transition-colors">
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
    <p className="text-[11px] text-accent tracking-[0.35em] uppercase mb-4 text-center font-medium">
      {children}
    </p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="atmo-section-title text-2xl sm:text-3xl font-bold text-center text-vellum mb-16 tracking-[0.1em] uppercase"
      style={{ }}
    >
      {children}
    </h2>
  );
}

function Divider({ variant = 'brass' }: { variant?: 'brass' | 'arcane' }) {
  const color = variant === 'brass' ? 'color-mix(in srgb, var(--color-brass) 12%, transparent)' : 'color-mix(in srgb, var(--color-accent) 8%, transparent)';
  return (
    <div className="max-w-xl mx-auto px-6 sm:px-12">
      <div className="h-px" style={{ background: `linear-gradient(to right, transparent, ${color}, transparent)` }} />
    </div>
  );
}

/* ── Card Components ── */

function MechanicCard({ title, description, color }: { title: string; description: string; color: 'brass' | 'arcane' }) {
  const isBrass = color === 'brass';
  const borderColor = isBrass ? 'color-mix(in srgb, var(--color-brass) 10%, transparent)' : 'color-mix(in srgb, var(--color-accent) 10%, transparent)';
  const titleColor = isBrass ? 'var(--color-text)' : 'var(--color-accent)';
  const hoverBorder = isBrass ? 'hover:border-brass/40' : 'hover:border-accent/40';
  const bgGlow = isBrass
    ? 'radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--color-brass) 3%, transparent) 0%, transparent 70%)'
    : 'radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--color-accent) 2%, transparent) 0%, transparent 70%)';

  return (
    <div
      className={`p-7 rounded-lg border transition-all duration-300 ${hoverBorder}`}
      style={{ borderColor, background: bgGlow }}
    >
      <h3 className="text-sm font-bold tracking-[0.15em] mb-4" style={{ color: titleColor }}>
        {title}
      </h3>
      <p className="text-[13px] text-vellum-muted leading-[1.9]">
        {description}
      </p>
    </div>
  );
}

function GearCard({ title, items, color }: { title: string; items: string[]; color: 'brass' | 'arcane' }) {
  const isBrass = color === 'brass';
  const borderColor = isBrass ? 'color-mix(in srgb, var(--color-brass) 10%, transparent)' : 'color-mix(in srgb, var(--color-accent) 10%, transparent)';
  const titleColor = isBrass ? 'var(--color-text)' : 'var(--color-accent)';
  const dotColor = isBrass ? 'bg-brass/50' : 'bg-accent/50';
  const bgGlow = isBrass
    ? 'radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--color-brass) 3%, transparent) 0%, transparent 70%)'
    : 'radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--color-accent) 2%, transparent) 0%, transparent 70%)';

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
          <li key={item} className="flex items-start gap-3 text-[13px] text-vellum-muted leading-relaxed">
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
    <div className="p-6 rounded-lg border border-brass/20" style={{
      background: 'radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--color-brass) 2%, transparent) 0%, transparent 70%)',
    }}>
      <span className="text-[10px] text-vellum-muted tracking-[0.25em] font-bold">{step}</span>
      <h3 className="text-sm font-bold text-vellum tracking-[0.12em] mt-3 mb-3">{title}</h3>
      <p className="text-[13px] text-vellum-dim leading-[1.8]">{description}</p>
    </div>
  );
}

function ControlKey({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-3 p-3.5 rounded-md border border-brass/20 bg-brass/[0.04]">
      <kbd className="text-xs font-bold text-brass-bright tracking-[0.1em] font-mono bg-brass/10 px-2.5 py-1.5 rounded border border-brass/25 min-w-[48px] text-center">
        {keys}
      </kbd>
      <span className="text-xs text-vellum-muted tracking-wide">{label}</span>
    </div>
  );
}
