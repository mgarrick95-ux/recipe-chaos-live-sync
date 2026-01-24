"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type RcSidebarItem = {
  href: string;
  label: string;
  title?: string;
};

export type RcSidebarProps = {
  items?: RcSidebarItem[];
  storageKey?: string; // remembers collapsed state
  className?: string;
};

const DEFAULT_ITEMS: RcSidebarItem[] = [
  { href: "/", label: "Home" },
  { href: "/recipes", label: "Recipes" },
  { href: "/meal-planning", label: "Meal Planning" },
  { href: "/shopping-list", label: "Shopping List" },
  { href: "/frostpantry", label: "Frost Pantry" },
  { href: "/settings", label: "Settings" },
];

export default function RcSidebar({
  items = DEFAULT_ITEMS,
  storageKey = "rc_sidebar_collapsed_v1",
  className = "",
}: RcSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      setCollapsed(raw === "1");
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed, storageKey]);

  const nav = useMemo(() => items || DEFAULT_ITEMS, [items]);

  return (
    <aside
      className={`rounded-3xl bg-white/5 ring-1 ring-white/10 p-3 ${className}`}
      style={{ width: collapsed ? 72 : 260 }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-extrabold text-white/70">
          {collapsed ? "RC" : "Recipe Chaos"}
        </div>
        <button
          type="button"
          className="rounded-xl bg-white/8 hover:bg-white/12 px-3 py-2 text-xs font-extrabold ring-1 ring-white/10 transition"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <div className="mt-3 grid gap-1">
        {nav.map((it) => {
          const active =
            pathname === it.href ||
            (it.href !== "/" && pathname?.startsWith(it.href));
          return (
            <Link
              key={it.href}
              href={it.href}
              title={it.title || it.label}
              className={[
                "rounded-2xl px-3 py-2 text-sm font-semibold ring-1 transition",
                active
                  ? "bg-fuchsia-500/20 ring-fuchsia-400/30 text-white"
                  : "bg-white/5 hover:bg-white/10 ring-white/10 text-white/80",
                collapsed ? "text-center" : "",
              ].join(" ")}
            >
              {collapsed ? it.label.slice(0, 1) : it.label}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
