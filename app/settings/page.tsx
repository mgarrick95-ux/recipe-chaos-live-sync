"use client";

import React from "react";
import { useUIPrefs } from "../../components/UIPrefsProvider";
import BrainCapacityPrompt from "../../components/BrainCapacityPrompt";

export default function SettingsPage() {
  const { prefs, setTone, setReduceChatter, setAskBrainDaily, brainCapacity, setBrainCapacity } = useUIPrefs();

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ marginBottom: 8 }}>Settings</h1>
      <div className="rcMuted" style={{ marginBottom: 18 }}>
        Quiet controls. Nothing motivational.
      </div>

      {/* Brain prompt appears here too (optional visibility) */}
      <BrainCapacityPrompt />

      <div className="rcCard" style={{ marginBottom: 16 }}>
        <div className="rcCardTitle">Tone</div>
        <div className="rcCardRow" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {["gentle", "plain_funny", "snark_lite", "spicy", "minimal"].map((tone) => (
            <button
              key={tone}
              type="button"
              className={`rcBtn ${prefs.tone === tone ? "rcBtnActive" : ""}`}
              onClick={() => setTone(tone as any)}
            >
              {tone}
            </button>
          ))}
        </div>
        <div className="rcMuted" style={{ marginTop: 10 }}>
          Tone changes wording only. It never changes features or logic.
        </div>
      </div>

      <div className="rcCard" style={{ marginBottom: 16 }}>
        <div className="rcCardTitle">Reduce chatter</div>
        <label className="rcToggleRow" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={prefs.reduceChatter}
            onChange={(e) => setReduceChatter(e.target.checked)}
          />
          <span>Fewer messages. Less commentary.</span>
        </label>
      </div>

      <div className="rcCard" style={{ marginBottom: 16 }}>
        <div className="rcCardTitle">Ask about brain capacity</div>
        <label className="rcToggleRow" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={prefs.askBrainDaily}
            onChange={(e) => setAskBrainDaily(e.target.checked)}
          />
          <span>Adjusts how much the app talks. Optional.</span>
        </label>

        <div className="rcMuted" style={{ marginTop: 12 }}>
          Current session: <b>{brainCapacity}</b>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {["very_little", "some", "normal", "extra"].map((v) => (
            <button
              key={v}
              type="button"
              className={`rcBtn ${brainCapacity === v ? "rcBtnActive" : ""}`}
              onClick={() => setBrainCapacity(v as any)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="rcCard">
        <div className="rcCardTitle">Notes</div>
        <div className="rcMuted" style={{ marginTop: 10 }}>
          • “Reduce chatter” overrides everything.<br />
          • “Very little / Some” will quietly soften wording automatically.<br />
          • “Extra” enables spice only if your Tone is set to spicy.
        </div>
      </div>
    </div>
  );
}
