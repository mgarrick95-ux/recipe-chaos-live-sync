// components/ui/AddRecipeInlineMenu.tsx
"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";

type AddRecipeInlineMenuProps = {
  hrefTypeIt?: string; // /recipes/add/manual
  hrefLink?: string; // /recipes/add/url
  hrefPhoto?: string; // /recipes/add/photo
  className?: string;
};

export default function AddRecipeInlineMenu({
  hrefTypeIt = "/recipes/add/manual",
  hrefLink = "/recipes/add/url",
  hrefPhoto = "/recipes/add/photo",
  className = "",
}: AddRecipeInlineMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    function onPointerDown(e: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-[var(--rc-accent)] hover:bg-[var(--rc-accent-hover)] px-6 py-3 font-extrabold text-black shadow-[0_12px_30px_rgba(255,153,51,0.18)]"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add recipe"
      >
        + Add recipe
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Add recipe options"
          className="absolute right-0 top-full mt-3 z-50 flex gap-2 rounded-full bg-[#0b1026]/90 backdrop-blur-md ring-1 ring-white/10 px-3 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
        >
          <Link
            href={hrefTypeIt}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="rounded-full bg-white/10 hover:bg-white/15 ring-1 ring-white/10 px-4 py-2 text-sm font-semibold text-white whitespace-nowrap"
          >
            Type it
          </Link>

          <Link
            href={hrefLink}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="rounded-full bg-white/10 hover:bg-white/15 ring-1 ring-white/10 px-4 py-2 text-sm font-semibold text-white whitespace-nowrap"
          >
            Link
          </Link>

          <Link
            href={hrefPhoto}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="rounded-full bg-white/10 hover:bg-white/15 ring-1 ring-white/10 px-4 py-2 text-sm font-semibold text-white whitespace-nowrap"
          >
            Photo
          </Link>
        </div>
      ) : null}
    </div>
  );
}
