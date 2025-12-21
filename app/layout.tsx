import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "RecipeChaos",
  description: "Your recipes, pantry, planning and more",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          display: "flex",
          height: "100vh",
          fontFamily: "sans-serif",
        }}
      >
        {/* Sidebar */}
        <nav
          style={{
            width: "220px",
            background: "#222",
            color: "white",
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <h2 style={{ margin: 0, marginBottom: "1rem", fontSize: "1.2rem" }}>
            RecipeChaos
          </h2>

          <Link href="/recipes" style={linkStyle}>
            📖 Recipes
          </Link>

          {/* Helpful shortcuts (Phase 3) */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "-0.5rem" }}>
            <Link href="/recipes/clip" style={subLinkStyle}>
              ↳ Save from URL
            </Link>
            <Link href="/recipes/paste" style={subLinkStyle}>
              ↳ Paste recipe
            </Link>
          </div>

          <Link href="/frostpantry" style={linkStyle}>
            🧊 Storage
          </Link>

          <Link href="/shopping-list" style={linkStyle}>
            🛒 Shopping List
          </Link>

          {/* ✅ Connect Meal Planning to the real page */}
          <Link href="/meal-planning" style={linkStyle}>
            🗓 Meal Planning
          </Link>
        </nav>

        {/* Main content area */}
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "2rem",
            background: "#ffffff",
            color: "#222",
          }}
        >
          {children}
        </main>
      </body>
    </html>
  );
}

const linkStyle: React.CSSProperties = {
  color: "white",
  textDecoration: "none",
  fontSize: "1rem",
  padding: "0.5rem 0",
  borderRadius: "4px",
};

const subLinkStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.85)",
  textDecoration: "none",
  fontSize: "0.92rem",
  padding: "0.15rem 0 0.15rem 1.25rem",
  borderRadius: "4px",
  opacity: 0.9,
};
