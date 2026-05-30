"use client";

// components/Sidebar.tsx
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

type NavItem = {
  href: string;
  label: string;
  icon?: string;
};

const mainItems: NavItem[] = [
  { href: "/recipes", label: "Recipes", icon: "📖" },
  { href: "/frostpantry", label: "Pantry & Freezer", icon: "🧊" },
  { href: "/shopping-list", label: "Shopping List", icon: "🛒" },
  { href: "/meal-planning", label: "Meal Planning", icon: "🗓" },
];

export default function Sidebar() {
  return (
    <nav className="h-screen w-[280px] border-r border-[color:var(--border)] bg-[color:var(--panel-solid)] text-[color:var(--text)]">
      <div className="px-5 py-6">
        <div className="mb-6">
          <div className="text-lg font-black tracking-tight">RecipeChaos</div>
          <div className="text-xs text-[color:var(--muted-2)]">
            Kitchen assistant (personal build)
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            {mainItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold text-[color:var(--text-soft)] ring-1 ring-transparent transition hover:bg-[color:var(--hover)] hover:text-[color:var(--text)] hover:ring-[color:var(--border)]"
              >
                {item.icon ? <span className="text-base">{item.icon}</span> : null}
                <span>{item.label}</span>
              </Link>
            ))}
          </div>

          <div className="rounded-3xl bg-[color:var(--card)] p-3 ring-1 ring-[color:var(--border)]">
            <Link
              href="/recipes/add"
              className="flex items-center justify-center rounded-2xl bg-[color:var(--primary)] px-4 py-2 text-sm font-extrabold text-white shadow-lg transition hover:bg-[color:var(--primary-hover)]"
            >
              + Add recipe
            </Link>
          </div>

          <div className="rounded-3xl bg-[color:var(--card)] p-3 ring-1 ring-[color:var(--border)]">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[color:var(--muted-2)]">
              Screen mode
            </div>
            <ThemeToggle />
          </div>

          <div className="text-xs text-[color:var(--muted-2)]">
            Tip: Add recipes via manual, URL, or photo — one place, no clutter.
          </div>
        </div>
      </div>
    </nav>
  );
}
