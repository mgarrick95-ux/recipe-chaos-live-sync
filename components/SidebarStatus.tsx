"use client";

// @/components/SidebarStatus.tsx
import Link from "next/link";
import { useUIPrefs } from "./UIPrefsProvider";

export default function SidebarStatus() {
  const { prefs, brainCapacity } = useUIPrefs();

  return (
    <div>
      <div className="rc-sidebar__sectionTitle">Status</div>

      <div className="rc-muted" style={{ marginBottom: 8 }}>
        Tone: <b style={{ color: "var(--text)" }}>{prefs.tone}</b>
        <br />
        Brain: <b style={{ color: "var(--text)" }}>{brainCapacity}</b>
      </div>

      <Link href="/settings" className="rc-btn">
        Settings
      </Link>

      <div className="rc-muted rc-small" style={{ marginTop: 10 }}>
        Meal Planning is a weekly list (not tied to days).<br />
        Shopping List is derived + editable.
      </div>
    </div>
  );
}
