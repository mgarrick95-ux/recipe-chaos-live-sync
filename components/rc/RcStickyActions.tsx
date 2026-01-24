"use client";

import React from "react";

export type RcStickyActionsProps = {
  children: React.ReactNode;
  className?: string;
};

export default function RcStickyActions({
  children,
  className = "",
}: RcStickyActionsProps) {
  return (
    <div className={`sticky bottom-0 z-40 ${className}`}>
      <div className="pointer-events-none">
        <div className="h-6 bg-gradient-to-t from-[#0b1026] to-transparent" />
      </div>
      <div className="pointer-events-auto rounded-3xl bg-white/5 ring-1 ring-white/10 backdrop-blur px-4 py-3">
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {children}
        </div>
      </div>
    </div>
  );
}
