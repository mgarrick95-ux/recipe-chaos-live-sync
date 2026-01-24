"use client";

import React, { useEffect, useState } from "react";

type ThemeMode = "dark" | "light";

function readTheme(): ThemeMode {
  try {
    const raw = window.localStorage.getItem("rc_ui_prefs_v1");
    const parsed = raw ? JSON.parse(raw) : null;
    const t = String(parsed?.theme ?? "").toLowerCase();
    return t === "light" || t === "dark" ? t : "dark";
  } catch {
    return "dark";
  }
}

function writeTheme(next: ThemeMode) {
  try {
    const key = "rc_ui_prefs_v1";
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed.theme = next;
    window.localStorage.setItem(key, JSON.stringify(parsed));
  } catch {}
}

function applyTheme(next: ThemeMode) {
  document.documentElement.dataset.theme = next;
  document.documentElement.classList.toggle("theme-dark", next === "dark");
  document.documentElement.classList.toggle("theme-light", next === "light");
}

export type RcThemeToggleProps = {
  className?: string;
  label?: string;
};

export default function RcThemeToggle({
  className = "",
  label,
}: RcThemeToggleProps) {
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    const t = readTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  function toggle() {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    writeTheme(next);
    applyTheme(next);
    try {
      window.dispatchEvent(new CustomEvent("rc_theme_changed", { detail: next }));
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={[
        "rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-2.5 text-sm font-semibold ring-1 ring-white/10 transition",
        className,
      ].join(" ")}
      title="Toggle theme"
    >
      {label ? `${label}: ` : ""}
      {theme === "dark" ? "Dark" : "Light"}
    </button>
  );
}
