import type { Metadata } from 'next';
import { JetBrains_Mono, Space_Grotesk } from 'next/font/google';

import './globals.css';

const displayFont = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700'],
});

const monoFont = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['500'],
});

export const metadata: Metadata = {
  title: 'EmberPath - Fire-safe Navigation',
  description:
    'Navigate safely through wildfire zones with real-time fire perimeters, smoke plumes, road closures, and safer route guidance.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${monoFont.variable} h-screen overflow-hidden bg-[#070a12] text-slate-50 antialiased`}>
        {children}
      </body>
    </html>
  );
}
