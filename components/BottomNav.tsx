// components/BottomNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = {
  href: string;
  label: string;
  icon: string;
};

const items: Item[] = [
  { href: "/recipes", label: "Recipes", icon: "📖" },
  { href: "/frostpantry", label: "Pantry", icon: "🧊" },
  { href: "/shopping-list", label: "List", icon: "🛒" },
  { href: "/meal-planning", label: "Plan", icon: "🗓" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-black/60 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-3">
        <div className="flex items-center justify-between py-2">
          {items.map((it) => {
            const active =
              pathname === it.href || (it.href !== "/" && pathname?.startsWith(it.href));

            return (
              <Link
                key={it.href}
                href={it.href}
                className={
                  "flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-2 text-xs font-semibold transition " +
                  (active ? "text-white" : "text-white/65 hover:text-white")
                }
                aria-current={active ? "page" : undefined}
              >
                <span className={"text-lg " + (active ? "drop-shadow" : "")}>
                  {it.icon}
                </span>
                <span>{it.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
