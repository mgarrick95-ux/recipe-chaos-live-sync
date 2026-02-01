// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

import { Amatic_SC, Inter } from "next/font/google";

import { UIPrefsProvider } from "@/components/UIPrefsProvider";
import Sidebar from "@/components/Sidebar";
import ThemeInitScript from "@/components/ThemeInitScript";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});

const amatic = Amatic_SC({
  subsets: ["latin"],
  display: "swap",
  weight: ["700"], // Bold only
  variable: "--font-amatic",
});

export const metadata: Metadata = {
  title: "RecipeChaos",
  description: "Meal planning that respects your pantry & freezer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={[
          // Make Inter the global base font
          inter.className,

          // Expose both fonts as CSS variables
          inter.variable,
          amatic.variable,

          "min-h-screen bg-[var(--bg)] text-[var(--text)]",
        ].join(" ")}
      >
        <ThemeInitScript />
        <UIPrefsProvider>
          <div className="min-h-screen">
            <div className="mx-auto max-w-[1600px]">
              <div className="grid min-h-screen grid-cols-1 md:grid-cols-[280px_1fr]">
                {/* Sidebar: desktop only */}
                <aside className="hidden md:block md:min-h-screen md:border-r md:border-white/10">
                  <Sidebar />
                </aside>

                {/* Content */}
                <main className="min-w-0">
                  <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
                    {children}
                  </div>
                </main>
              </div>
            </div>
          </div>
        </UIPrefsProvider>
      </body>
    </html>
  );
}
