"use client";

import { useEffect } from "react";

export type ToastData = {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number; // ms
};

export function Toast({
  toast,
  onClose,
}: {
  toast: ToastData;
  onClose: (id: string) => void;
}) {
  useEffect(() => {
    const t = setTimeout(
      () => onClose(toast.id),
      toast.duration ?? 5000
    );
    return () => clearTimeout(t);
  }, [toast, onClose]);

  return (
    <div className="pointer-events-auto rounded-xl bg-[#1a1a2e] text-white px-4 py-3 shadow-lg ring-1 ring-white/10 flex items-center gap-3">
      <span className="flex-1">{toast.message}</span>

      {toast.actionLabel && toast.onAction && (
        <button
          onClick={() => {
            toast.onAction?.();
            onClose(toast.id);
          }}
          className="underline underline-offset-4 text-fuchsia-300 hover:text-fuchsia-200"
        >
          {toast.actionLabel}
        </button>
      )}

      <button
        onClick={() => onClose(toast.id)}
        className="text-white/50 hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
