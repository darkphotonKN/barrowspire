'use client';

import { useEffect, useRef, useCallback } from 'react';

import { BARROW } from '@/utils/theme';

/** Ember tone, as an `r, g, b` triple for canvas rgba(). Derived from the
 *  palette rather than restated — ADR-0013 applies to canvas too. */
const EMBER_RGB = [
  parseInt(BARROW.amber.slice(1, 3), 16),
  parseInt(BARROW.amber.slice(3, 5), 16),
  parseInt(BARROW.amber.slice(5, 7), 16),
].join(', ');

interface Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  color: string;
  size: number;
  vx: number;
  vy: number;
}

/**
 * An ember mote — ash lifted off a torch, drifting up and burning out.
 *
 * This replaced a starfield: fixed points twinkling in place read as a night
 * sky, which is the wrong world for a barrow-crawl. Motes drift and expire
 * instead of blinking, which is the whole difference.
 */
interface Mote {
  x: number;
  y: number;
  size: number;
  baseOpacity: number;
  /** Upward drift, px/frame. Embers rise. */
  vy: number;
  /** Lateral sway amplitude. */
  sway: number;
  phase: number;
  /** 0..1, advances each frame; the mote fades in and burns out over it. */
  life: number;
  lifeSpan: number;
}

export default function ParticleText() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const motesRef = useRef<Mote[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const animationRef = useRef<number>(0);

  const initParticles = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    // Resolve the CSS variable to get the actual loaded font family
    const fontFamily =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--font-cinzel')
        .trim() || 'Cinzel';

    // Offscreen canvas to render text and sample pixels
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;

    const fontSize = Math.min(w / 6, 140);
    const lineGap = fontSize * 0.15;

    offCtx.fillStyle = BARROW.vellum;
    offCtx.font = `900 ${fontSize}px ${fontFamily}, Cinzel, serif`;
    offCtx.textAlign = 'center';
    offCtx.textBaseline = 'middle';
    offCtx.fillText('THE AGE OF', w / 2, h / 2 - fontSize / 2 - lineGap);
    offCtx.fillText('BARROWSPIRE', w / 2, h / 2 + fontSize / 2 + lineGap);

    // Sample pixel data to find text positions
    const imageData = offCtx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const particles: Particle[] = [];
    const gap = Math.max(3, Math.floor(Math.min(w, h) / 250));
    const colors = [BARROW.amber, BARROW.brassBright, BARROW.ember];

    for (let y = 0; y < h; y += gap) {
      for (let x = 0; x < w; x += gap) {
        const alpha = data[(y * w + x) * 4 + 3];
        if (alpha > 128) {
          particles.push({
            x: Math.random() * w,
            y: Math.random() * h,
            originX: x,
            originY: y,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 1.5 + 0.5,
            vx: 0,
            vy: 0,
          });
        }
      }
    }

    particlesRef.current = particles;

    // Generate drifting embers. Sparser than the starfield it replaced —
    // ash reads as atmosphere in ones and twos, as snow in hundreds.
    const moteCount = Math.floor((w * h) / 22000);
    const motes: Mote[] = [];
    for (let i = 0; i < moteCount; i++) {
      motes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() * 1.6 + 0.3,
        baseOpacity: Math.random() * 0.34 + 0.1,
        vy: -(Math.random() * 0.22 + 0.06),
        sway: Math.random() * 0.5 + 0.15,
        phase: Math.random() * Math.PI * 2,
        life: Math.random(),
        lifeSpan: Math.random() * 420 + 260,
      });
    }
    motesRef.current = motes;
  }, []);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Drift the embers upward and burn them out. No twinkle: a mote that
    // blinks in place is a star, and this is ash.
    const time = performance.now() * 0.001;
    for (const m of motesRef.current) {
      m.life += 1;
      if (m.life > m.lifeSpan) {
        m.life = 0;
        m.x = Math.random() * canvas.width;
        m.y = canvas.height + 8;
      }
      m.y += m.vy;
      m.x += Math.sin(time * 0.6 + m.phase) * m.sway * 0.35;

      // Fade in over the first fifth of life, burn out over the last half.
      const t = m.life / m.lifeSpan;
      const fade = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      const opacity = Math.max(0, m.baseOpacity * fade);

      ctx.fillStyle = `rgba(${EMBER_RGB}, ${opacity})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
      ctx.fill();
    }

    const { x: mx, y: my } = mouseRef.current;
    const repulseRadius = 220;
    const friction = 0.96;
    const lerpSpeed = 0.025;

    for (const p of particlesRef.current) {
      // Mouse repulsion — gentle, wide push
      const dx = p.x - mx;
      const dy = p.y - my;
      const distSq = dx * dx + dy * dy;

      if (distSq < repulseRadius * repulseRadius && distSq > 0) {
        const dist = Math.sqrt(distSq);
        const force = ((repulseRadius - dist) / repulseRadius) * 0.4;
        p.vx += (dx / dist) * force;
        p.vy += (dy / dist) * force;
      }

      // Ambient drift — subtle space-floating feel
      p.vx += (Math.random() - 0.5) * 0.03;
      p.vy += (Math.random() - 0.5) * 0.03;

      // Apply and decay velocity (repulsion + drift only)
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= friction;
      p.vy *= friction;

      // Lerp toward origin — smooth convergence, no bounce
      p.x += (p.originX - p.x) * lerpSpeed;
      p.y += (p.originY - p.y) * lerpSpeed;

      // Draw particle
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }

    animationRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout>;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const start = () => {
      initParticles();
      if (reducedMotion) {
        // Honour the preference: paint one settled frame, then stop. A CSS
        // media query cannot reach requestAnimationFrame, so this is the
        // only place the preference can be respected.
        animate();
        cancelAnimationFrame(animationRef.current);
        return;
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    // Wait for fonts before sampling text pixels
    document.fonts.ready.then(start);

    const handleResize = () => {
      cancelAnimationFrame(animationRef.current);
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(start, 200);
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        mouseRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      }
    };

    const handleTouchEnd = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      cancelAnimationFrame(animationRef.current);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [initParticles, animate]);

  return <canvas ref={canvasRef} className="splash-canvas" />;
}
