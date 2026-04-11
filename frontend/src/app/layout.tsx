import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EmberPath Dashboard',
  description: 'California wildfire evacuation intelligence.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-50">
        <div className="min-h-screen bg-slate-950">
          {children}
        </div>
      </body>
    </html>
  );
}