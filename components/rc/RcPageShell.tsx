"use client";

import React from "react";

export type RcPageShellProps = {
  header: React.ReactNode;
  children: React.ReactNode;
  maxWidthClassName?: string;
  bodyClassName?: string;
};

export default function RcPageShell({
  header,
  children,
  maxWidthClassName = "max-w-6xl",
  bodyClassName = "py-8",
}: RcPageShellProps) {
  return (
    <div className="rc-page">
      <div className="border-b border-[color:var(--border)]">
        <div className={`mx-auto px-6 ${maxWidthClassName}`}>{header}</div>
      </div>

      <main className={`mx-auto px-6 ${maxWidthClassName} ${bodyClassName}`}>
        {children}
      </main>
    </div>
  );
}
