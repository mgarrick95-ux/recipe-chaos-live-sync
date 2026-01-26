// components/BottomNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; icon: string };

const NAV: NavItem[] = [
  { href: "/recipes", label: "Recipes", icon: "📖" },
  { href: "/frostpantry", label: "Pantry", icon: "🧊" },
  { href: "/shopping-list", label: "List", icon: "🛒" },
  { href: "/meal-planning", label: "Plan", icon: "🗓" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden" aria-label="Primary">
      <div className="rc-bottomnav">
        <div className="mx-auto max-w-6xl px-3 py-2">
          <div className="grid grid-cols-4 gap-2">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "flex flex-col items-center justify-center rounded-2xl px-2 py-2 text-xs ring-1 transition",
                    active
                      ? "bg-white/14 text-white ring-white/14"
                      : "bg-white/6 text-white/75 ring-white/10 hover:bg-white/10",
                  ].join(" ")}
                >
                  <span className="text-lg leading-none">{item.icon}</span>
                  <span className="mt-1 font-semibold">{item.label}</span>
                  <span className={["mt-1 h-1 w-10 rounded-full", active ? "bg-white/70" : "bg-transparent"].join(" ")} />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
