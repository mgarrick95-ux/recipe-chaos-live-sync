// @/components/Sidebar.tsx
import Link from "next/link";
import type React from "react";

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
    <nav className="w-[260px] shrink-0 border-r border-white/10 bg-[#050816] text-white">
      <div className="px-5 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="text-lg font-black tracking-tight">RecipeChaos</div>
          <div className="text-xs text-white/60">
            Kitchen assistant (personal build)
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {/* Primary navigation */}
          <div className="flex flex-col gap-1">
            {mainItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold text-white/90 ring-1 ring-transparent transition hover:bg-white/8 hover:text-white hover:ring-white/10"
              >
                {item.icon ? (
                  <span className="text-base">{item.icon}</span>
                ) : null}
                <span>{item.label}</span>
              </Link>
            ))}
          </div>

          {/* Recipes quick action */}
          <div className="rounded-3xl bg-white/5 p-3 ring-1 ring-white/10">
            <Link
              href="/recipes/add"
              className="flex items-center justify-center rounded-2xl bg-fuchsia-500 px-4 py-2 text-sm font-extrabold text-white shadow-lg shadow-fuchsia-500/25 transition hover:bg-fuchsia-400"
            >
              + Add recipe
            </Link>
          </div>

          {/* Subtle footer hint */}
          <div className="text-xs text-white/55">
            Tip: Use Add recipe to choose manual, URL, or photo — one place, no clutter.
          </div>
        </div>
      </div>
    </nav>
  );
}
