import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Docs Chat', description: 'Phase 3 project: chat with your docs, with citations' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
