import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Tokens are defined once in globals.css :root (ADR-0013). This maps
      // them onto utilities so `bg-card`, `text-vellum` etc. resolve without
      // restating a single value here.
      colors: {
        primary: 'var(--color-primary)',
        'primary-bright': 'var(--color-primary-bright)',
        accent: 'var(--color-accent)',
        danger: 'var(--color-danger)',
        'bg-dark': 'var(--color-bg-dark)',
        'bg-darker': 'var(--color-bg-darker)',
        card: 'var(--color-bg-card)',
        'card-2': 'var(--color-bg-card-2)',
        brass: 'var(--color-brass)',
        'brass-bright': 'var(--color-brass-bright)',
        vellum: 'var(--color-text)',
        'vellum-dim': 'var(--color-text-dim)',
        'vellum-muted': 'var(--color-text-muted)',
        'rarity-common': 'var(--rarity-common)',
        'rarity-uncommon': 'var(--rarity-uncommon)',
        'rarity-rare': 'var(--rarity-rare)',
        'rarity-epic': 'var(--rarity-epic)',
        'rarity-legendary': 'var(--rarity-legendary)',
      },
      fontFamily: {
        display: 'var(--font-heading)',
        body: 'var(--font-body)',
      },
    },
  },
  plugins: [],
};

export default config;
