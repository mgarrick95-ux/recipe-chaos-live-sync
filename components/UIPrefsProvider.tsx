"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  type BrainCapacity,
  type UIPrefs,
  loadUIPrefs,
  saveUIPrefs,
  defaultUIPrefs,
  getSessionBrainCapacity,
  setSessionBrainCapacity,
  isSameLocalDay,
} from "@/lib/uiPrefs";

type UIPrefsContextValue = {
  // persisted prefs (localStorage)
  prefs: UIPrefs;
  setPrefs: React.Dispatch<React.SetStateAction<UIPrefs>>;

  // convenience setters
  setTone: (tone: UIPrefs["tone"]) => void;
  setReduceChatter: (v: boolean) => void;
  setAskBrainDaily: (v: boolean) => void;

  // session brain capacity (sessionStorage)
  brainCapacity: BrainCapacity;
  setBrainCapacity: (v: BrainCapacity) => void;

  // prompt logic
  shouldPromptBrain: boolean;
  markBrainPromptCompletedToday: () => void;
};

const UIPrefsContext = createContext<UIPrefsContextValue | null>(null);

export function UIPrefsProvider({ children }: { children: React.ReactNode }) {
  // ---- prefs (localStorage) ----
  const [prefs, setPrefs] = useState<UIPrefs>(() => defaultUIPrefs());

  useEffect(() => {
    // load once on client
    setPrefs(loadUIPrefs());
  }, []);

  useEffect(() => {
    // persist on change
    saveUIPrefs(prefs);
  }, [prefs]);

  // ---- brain capacity (sessionStorage) ----
  const [brainCapacity, setBrainCapacityState] = useState<BrainCapacity>(() => {
    return getSessionBrainCapacity() ?? "normal";
  });

  function setBrainCapacity(v: BrainCapacity) {
    setBrainCapacityState(v);
    setSessionBrainCapacity(v);
  }

  // ---- derived: should we prompt today? ----
  const shouldPromptBrain = useMemo(() => {
    if (!prefs.askBrainDaily) return false;

    const last = prefs.lastBrainPromptISO;
    if (!last) return true;

    const nowISO = new Date().toISOString();
    return !isSameLocalDay(last, nowISO);
  }, [prefs.askBrainDaily, prefs.lastBrainPromptISO]);

  function markBrainPromptCompletedToday() {
    const nowISO = new Date().toISOString();
    setPrefs((p) => ({ ...p, lastBrainPromptISO: nowISO }));
  }

  // ---- convenience setters ----
  function setTone(tone: UIPrefs["tone"]) {
    setPrefs((p) => ({ ...p, tone }));
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
