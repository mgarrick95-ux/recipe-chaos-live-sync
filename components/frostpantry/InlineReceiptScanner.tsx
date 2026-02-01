"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReceiptScanTool from "@/components/frostpantry/ReceiptScanTool";

type Props = {
  defaultOpen?: boolean;
  title?: string;
  subtitle?: string;
};

export default function InlineReceiptScanner({
  defaultOpen = false,
  title = "Scan receipt",
  subtitle = "Paste text or upload photos. Review first. Add only what you want.",
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // If it opens, gently scroll it into view (helps when it’s below the fold)
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => window.clearTimeout(t);
  }, [open]);

  const btnBase =
    "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-white/10 transition";
  const btnOpen = "bg-white/10 hover:bg-white/15";
  const btnPrimary = "bg-fuchsia-500 hover:bg-fuchsia-400 text-black font-extrabold shadow-lg shadow-fuchsia-500/20";

  const wrapClass = useMemo(
    () =>
      open
        ? "rounded-3xl bg-white/5 ring-1 ring-white/10 p-5"
        : "rounded-3xl bg-white/5 ring-1 ring-white/10 p-5",
    [open]
  );

  return (
    <div className={wrapClass} ref={panelRef}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-[240px]">
          <div className="text-xl font-extrabold tracking-tight">{title}</div>
          <div className="mt-1 text-sm text-white/65">{subtitle}</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`${btnBase} ${open ? btnOpen : btnPrimary}`}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="rc-receipt-inline-panel"
          >
            {open ? "Close" : "Scan receipt"}
          </button>

          {open ? (
            <button
              type="button"
              className={`${btnBase} ${btnOpen}`}
              onClick={() => {
                setOpen(false);
                // small “no drama” close; no other side effects
              }}
            >
              Hide
            </button>
          ) : null}
        </div>
      </div>

      {open ? (
        <div id="rc-receipt-inline-panel" className="mt-5">
          {/* ReceiptScanTool already contains: Paste + Photos modes */}
          <ReceiptScanTool />
        </div>
      ) : null}
    </div>
  );
}
