import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Ops Copilot', description: 'Phase 4 project: an agent with tools, approvals, an audit log and evals' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
