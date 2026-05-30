// lib/uiPrefs.ts
export type ToneMode = "gentle" | "plain_funny" | "snark_lite" | "spicy" | "minimal";
export type BrainCapacity = "very_little" | "some" | "normal" | "extra";
export type ThemeMode = "dark" | "light";

export type UIPrefs = {
  tone: ToneMode;
  theme: ThemeMode;
  reduceChatter: boolean;
  askBrainDaily: boolean;
  lastBrainPromptISO: string | null;
};

export const PREFS_KEY = "recipechaos_ui_prefs_v1";
const SESSION_BRAIN_KEY = "recipechaos_brain_capacity_session_v1";

export function defaultUIPrefs(): UIPrefs {
  return {
    tone: "plain_funny",
    theme: "dark",
    reduceChatter: false,
    askBrainDaily: true,
    lastBrainPromptISO: null,
  };
}

export function isTheme(v: any): v is ThemeMode {
  return v === "dark" || v === "light";
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;

  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("theme-dark", theme === "dark");
  document.documentElement.classList.toggle("theme-light", theme === "light");
}

export function loadUIPrefs(): UIPrefs {
  if (typeof window === "undefined") return defaultUIPrefs();

  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultUIPrefs();

    const parsed = JSON.parse(raw);
    const base = defaultUIPrefs();

    return {
      tone: isTone(parsed.tone) ? parsed.tone : base.tone,
      theme: isTheme(parsed.theme) ? parsed.theme : base.theme,
      reduceChatter: typeof parsed.reduceChatter === "boolean" ? parsed.reduceChatter : base.reduceChatter,
      askBrainDaily: typeof parsed.askBrainDaily === "boolean" ? parsed.askBrainDaily : base.askBrainDaily,
      lastBrainPromptISO: typeof parsed.lastBrainPromptISO === "string" ? parsed.lastBrainPromptISO : null,
    };
  } catch {
    return defaultUIPrefs();
  }
}

export function saveUIPrefs(prefs: UIPrefs) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function getSessionBrainCapacity(): BrainCapacity | null {
  if (typeof window === "undefined") return null;

  try {
    const v = window.sessionStorage.getItem(SESSION_BRAIN_KEY);
    if (isBrain(v)) return v;
    return null;
  } catch {
    return null;
  }
}

export function setSessionBrainCapacity(v: BrainCapacity) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(SESSION_BRAIN_KEY, v);
  } catch {
    // ignore
  }
}

function isTone(v: any): v is ToneMode {
  return v === "gentle" || v === "plain_funny" || v === "snark_lite" || v === "spicy" || v === "minimal";
}

function isBrain(v: any): v is BrainCapacity {
  return v === "very_little" || v === "some" || v === "normal" || v === "extra";
}

export function isSameLocalDay(isoA: string, isoB: string): boolean {
  try {
    const a = new Date(isoA);
    const b = new Date(isoB);

    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  } catch {
    return false;
  }
}
