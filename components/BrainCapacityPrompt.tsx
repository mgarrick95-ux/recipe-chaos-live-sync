"use client";

import React from "react";
import { useUIPrefs } from "@/components/UIPrefsProvider";
import { BrainCapacity } from "@/lib/uiPrefs";

const options: Array<{ value: BrainCapacity; label: string; feedback: string }> = [
  { value: "very_little", label: "Very little", feedback: "Easy mode activated!" },
  { value: "some", label: "Some", feedback: "Low-power mode on." },
  { value: "normal", label: "Normal", feedback: "Business as usual." },
  { value: "extra", label: "Extra", feedback: "Spicy mode enabled — tell me if it’s too much." },
];

export default function BrainCapacityPrompt() {
  const { shouldPromptBrain, markBrainPromptCompletedToday, setBrainCapacity, prefs } = useUIPrefs();

  if (!shouldPromptBrain) return null;

  // If Reduce Chatter is on, don’t prompt (it’s noise).
  if (prefs.reduceChatter) return null;

  return (
    <div className="rcCard" style={{ marginBottom: 16 }}>
      <div className="rcCardTitle">How much brain do you have today?</div>
      <div className="rcCardRow" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {options.map((opt) => (
          <button
            key={opt.value}
            className="rcBtn"
            onClick={() => {
              setBrainCapacity(opt.value);
              markBrainPromptCompletedToday();
              // We keep feedback elsewhere (screens/toasts), not here (avoid extra chatter).
            }}
            type="button"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
