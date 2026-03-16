"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";

type AddRecipeInlineMenuProps = {
  hrefTypeIt?: string;
  hrefLink?: string;
  hrefPhoto?: string;
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

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!rootRef.current || !target) return;
      if (!rootRef.current.contains(target)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const triggerClassName = [
    "inline-flex items-center justify-center rounded-full",
    "px-6 py-4 text-xl font-extrabold tracking-tight",
    "text-white bg-white/10 hover:bg-white/16",
    "ring-1 ring-white/15 shadow-[0_12px_32px_rgba(0,0,0,0.25)]",
    "backdrop-blur-md transition focus:outline-none focus:ring-2 focus:ring-white/35",
    "min-w-[220px]",
  ].join(" ");

  const itemClassName = [
    "inline-flex items-center justify-center rounded-full",
    "px-4 py-2.5 text-sm font-semibold",
    "text-white bg-white/10 hover:bg-white/16",
    "ring-1 ring-white/10 transition ",
    "focus:outline-none focus:ring-2 focus:ring-white/30",
  ].join(" ");

  return (
    <div ref={rootRef} className={["relative", className].filter(Boolean).join(" ")}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={triggerClassName}
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
          className="absolute right-0 top-full z-50 mt-3 flex flex-wrap gap-2 rounded-2xl bg-[#0b1026]/92 px-3 py-3 backdrop-blur-md ring-1 ring-white/12 shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
        >
          <Link
            href={hrefTypeIt}
            role="menuitem"
            onClick={() => setOpen(false)}
            className={itemClassName}
          >
            Type it
          </Link>

          <Link
            href={hrefLink}
            role="menuitem"
            onClick={() => setOpen(false)}
            className={itemClassName}
          >
            Paste link
          </Link>

          <Link
            href={hrefPhoto}
            role="menuitem"
            onClick={() => setOpen(false)}
            className={itemClassName}
          >
            Add photo
          </Link>
        </div>
      ) : null}
    </div>
  );
}
