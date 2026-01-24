"use client";

import React, { useEffect, useState } from "react";

export type RcCelebrationProps = {
  show: boolean;
  message?: string;
  autoHideMs?: number;
  onDone?: () => void;
};

export default function RcCelebration({
  show,
  message = "Nice.",
  autoHideMs = 1200,
  onDone,
}: RcCelebrationProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!show) {
      setOpen(false);
      return;
    }
    setOpen(true);
    const t = window.setTimeout(() => {
      setOpen(false);
      onDone?.();
    }, autoHideMs);
    return () => window.clearTimeout(t);
  }, [show, autoHideMs, onDone]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.45)" }}
        onMouseDown={() => {
          setOpen(false);
          onDone?.();
        }}
      />
      <div className="relative w-full max-w-md rounded-3xl bg-[#0b1026] ring-1 ring-white/10 p-6 shadow-2xl">
        <div className="text-2xl font-extrabold tracking-tight text-white/90">
          {message}
        </div>
        <div className="mt-2 text-sm text-white/60">
          (tap anywhere to close)
        </div>
      </div>
    </div>
  );
}
