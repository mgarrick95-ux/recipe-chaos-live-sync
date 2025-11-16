
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'RecipeChaos',
  description: 'Pantry-aware meal planning with live sync.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="page">
          <header style={{marginBottom:'1rem'}}>
            <h1 style={{fontSize:'1.6rem', fontWeight:700}}>RecipeChaos</h1>
            <p style={{fontSize:'0.9rem', opacity:0.8}}>AI‑assisted meal planning that actually respects your pantry & freezer.</p>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
