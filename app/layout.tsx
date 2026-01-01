import type { Metadata } from "next";
import "./globals.css";

import { UIPrefsProvider } from "@/components/UIPrefsProvider";
import Sidebar from "@/components/Sidebar";
import ThemeInitScript from "@/components/ThemeInitScript";

export const metadata: Metadata = {
  title: "RecipeChaos",
  description: "Meal planning that respects your pantry & freezer.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ThemeInitScript />
        <UIPrefsProvider>
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
        </UIPrefsProvider>
      </body>
    </html>
  );
}
