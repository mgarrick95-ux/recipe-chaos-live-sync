// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

import { UIPrefsProvider } from "@/components/UIPrefsProvider";
import Sidebar from "@/components/Sidebar";
import ThemeInitScript from "@/components/ThemeInitScript";
import BottomNav from "@/components/BottomNav";

import { Inter, Plus_Jakarta_Sans } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RecipeChaos",
  description: "Meal planning that respects your pantry & freezer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      <body className="font-sans">
        <ThemeInitScript />
        <UIPrefsProvider>
          {/* Desktop layout (keeps your current workflow) */}
          <div className="hidden md:block">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "280px 1fr",
                minHeight: "100vh",
              }}
            >
              <Sidebar />
              <main style={{ padding: 24 }}>{children}</main>
            </div>
          </div>

          {/* Mobile layout (bottom nav, no sidebar) */}
          <div className="md:hidden">
            <main className="px-4 pt-4 pb-24">{children}</main>
            <BottomNav />
          </div>
        </UIPrefsProvider>
      </body>
    </html>
  );
}
