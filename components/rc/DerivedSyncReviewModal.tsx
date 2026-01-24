"use client";

import React from "react";

export type DerivedSyncRow = {
  id?: string;
  name: string;
  quantity?: number;
  sourceRecipeTitle?: string | null;
  reason?: string | null; // any text you want
};

export type DerivedSyncReviewModalProps = {
  open: boolean;
  title?: string;
  subtitle?: string;
  rows?: DerivedSyncRow[];
  confirmLabel?: string;
  cancelLabel?: string;
  onClose: () => void;
  onConfirm?: () => void;
};

export default function DerivedSyncReviewModal({
  open,
  title = "Review derived items",
  subtitle = "Nothing changes unless you confirm.",
  rows = [],
  confirmLabel = "Confirm",
  cancelLabel = "Close",
  onClose,
  onConfirm,
}: DerivedSyncReviewModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-2xl rounded-3xl bg-[#0b1026] ring-1 ring-white/10 p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-xl font-extrabold tracking-tight">{title}</div>
            <div className="mt-2 text-white/70 text-sm">{subtitle}</div>
          </div>

          <button
            type="button"
            className="rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-2.5 text-sm font-semibold ring-1 ring-white/10 transition"
            onClick={onClose}
          >
            {cancelLabel}
          </button>
        </div>

        <div
          className="mt-5 rounded-2xl bg-white/5 ring-1 ring-white/10 p-4"
          style={{ maxHeight: 460, overflow: "auto" }}
        >
          {rows.length === 0 ? (
            <div className="text-white/70 text-sm">Nothing to review.</div>
          ) : (
            <div className="grid gap-3">
              {rows.map((r, idx) => (
                <div
                  key={(r.id ?? `${r.name}-${idx}`).toString()}
                  className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-extrabold text-white/90">
                        {r.name}
                        {typeof r.quantity === "number" && r.quantity > 0 ? (
                          <span className="text-white/55 font-semibold">
                            {" "}
                            ×{r.quantity}
                          </span>
                        ) : null}
                      </div>
                      {r.sourceRecipeTitle ? (
                        <div className="mt-1 text-xs text-white/55">
                          From:{" "}
                          <span className="text-white/75 font-semibold">
                            {r.sourceRecipeTitle}
                          </span>
                        </div>
                      ) : null}
                      {r.reason ? (
                        <div className="mt-1 text-xs text-white/45">
                          {r.reason}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {onConfirm ? (
          <div className="mt-5 flex items-center justify-end gap-2 flex-wrap">
            <button
              type="button"
              className="rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-2.5 text-sm font-semibold ring-1 ring-white/10 transition"
              onClick={onClose}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className="rounded-2xl bg-fuchsia-500 hover:bg-fuchsia-400 px-4 py-2.5 text-sm font-semibold disabled:opacity-50 shadow-lg shadow-fuchsia-500/20 transition"
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
