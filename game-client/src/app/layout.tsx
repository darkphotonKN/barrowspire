import type { Metadata } from 'next';
import { Pirata_One, EB_Garamond } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import AuthGuard from '@/components/AuthGuard';

// Display face. Blackletter, bound to --font-heading and used only at >=28px
// on the logo, the hero, and the page h1 — see docs/design-guideline.md.
// Pirata One over UnifrakturMaguntia deliberately: authentic Fraktur is
// markedly harder to read, and legibility is the real risk with blackletter.
const pirataOne = Pirata_One({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-pirata',
  display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

// The readable workhorse: body, labels, nav, buttons, inputs, tables.
const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  variable: '--font-garamond',
  display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

export const metadata: Metadata = {
  title: 'The Age of Barrowspire',
  description: 'Delve the barrow-deep. Few return whole.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${pirataOne.variable} ${ebGaramond.variable}`}>
      <body>
        <AuthGuard>
          <Header />
          {children}
        </AuthGuard>
      </body>
    </html>
  );
}
