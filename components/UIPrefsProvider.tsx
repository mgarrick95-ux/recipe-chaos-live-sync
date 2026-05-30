"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  type BrainCapacity,
  type UIPrefs,
  type ThemeMode,
  loadUIPrefs,
  saveUIPrefs,
  defaultUIPrefs,
  getSessionBrainCapacity,
  setSessionBrainCapacity,
  isSameLocalDay,
  applyTheme,
} from "@/lib/uiPrefs";

type UIPrefsContextValue = {
  prefs: UIPrefs;
  setPrefs: React.Dispatch<React.SetStateAction<UIPrefs>>;
  setTone: (tone: UIPrefs["tone"]) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setReduceChatter: (v: boolean) => void;
  setAskBrainDaily: (v: boolean) => void;
  brainCapacity: BrainCapacity;
  setBrainCapacity: (v: BrainCapacity) => void;
  shouldPromptBrain: boolean;
  markBrainPromptCompletedToday: () => void;
};

const UIPrefsContext = createContext<UIPrefsContextValue | null>(null);

export function UIPrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<UIPrefs>(() => defaultUIPrefs());
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    const loaded = loadUIPrefs();
    setPrefs(loaded);
    applyTheme(loaded.theme);
    setPrefsLoaded(true);
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    saveUIPrefs(prefs);
    applyTheme(prefs.theme);
  }, [prefs, prefsLoaded]);

  const [brainCapacity, setBrainCapacityState] = useState<BrainCapacity>(() => {
    return getSessionBrainCapacity() ?? "normal";
  });

  function setBrainCapacity(v: BrainCapacity) {
    setBrainCapacityState(v);
    setSessionBrainCapacity(v);
  }

  const shouldPromptBrain = useMemo(() => {
    if (!prefs.askBrainDaily) return false;
    const last = prefs.lastBrainPromptISO;
    if (!last) return true;
    return !isSameLocalDay(last, new Date().toISOString());
  }, [prefs.askBrainDaily, prefs.lastBrainPromptISO]);

  function markBrainPromptCompletedToday() {
    setPrefs((p) => ({ ...p, lastBrainPromptISO: new Date().toISOString() }));
  }

  function setTone(tone: UIPrefs["tone"]) {
    setPrefs((p) => ({ ...p, tone }));
  }

  function setTheme(theme: ThemeMode) {
    setPrefs((p) => ({ ...p, theme }));
  }

  function toggleTheme() {
    setPrefs((p) => ({ ...p, theme: p.theme === "dark" ? "light" : "dark" }));
  }

  function setReduceChatter(v: boolean) {
    setPrefs((p) => ({ ...p, reduceChatter: v }));
  }

  function setAskBrainDaily(v: boolean) {
    setPrefs((p) => ({ ...p, askBrainDaily: v }));
  }

  const value = useMemo<UIPrefsContextValue>(
    () => ({
      prefs,
      setPrefs,
      setTone,
      setTheme,
      toggleTheme,
      setReduceChatter,
      setAskBrainDaily,
      brainCapacity,
      setBrainCapacity,
      shouldPromptBrain,
      markBrainPromptCompletedToday,
    }),
    [prefs, brainCapacity, shouldPromptBrain]
  );

  return <UIPrefsContext.Provider value={value}>{children}</UIPrefsContext.Provider>;
}

export function useUIPrefs() {
  const ctx = useContext(UIPrefsContext);
  if (!ctx) throw new Error("useUIPrefs must be used inside UIPrefsProvider");
  return ctx;
}
