"use client";

import React from "react";
import { useUIPrefs } from "@/components/UIPrefsProvider";

export type RcThemeToggleProps = {
  className?: string;
  label?: string;
};

export default function RcThemeToggle({
  className = "",
  label,
}: RcThemeToggleProps) {
  const { prefs, toggleTheme } = useUIPrefs();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={[
        "rc-btn rounded-2xl px-4 py-2.5 text-sm font-semibold transition",
        className,
      ].join(" ")}
      title="Toggle theme"
    >
      {label ? `${label}: ` : ""}
      {prefs.theme === "dark" ? "Dark" : "Light"}
    </button>
  );
}
