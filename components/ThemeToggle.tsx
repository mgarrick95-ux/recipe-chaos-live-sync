"use client";

import { useEffect, useState } from "react";

type ThemeMode = "system" | "light" | "dark";

const KEY = "recipechaos_theme_mode_v1";

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;

  if (mode === "system") {
    root.removeAttribute("data-theme");
    return;
  }

  root.setAttribute("data-theme", mode);
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as ThemeMode | null) ?? "system";
    setMode(saved);
    applyTheme(saved);
  }, []);

  function setAndSave(next: ThemeMode) {
    setMode(next);
    localStorage.setItem(KEY, next);
    applyTheme(next);
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button type="button" onClick={() => setAndSave("system")}>
        System
      </button>
      <button type="button" onClick={() => setAndSave("dark")}>
        Dark
      </button>
      <button type="button" onClick={() => setAndSave("light")}>
        Light
      </button>
    </div>
  );
}
