import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Support Copilot', description: 'Phase 2 project: streaming chat with tools, structured output and a cost meter' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
