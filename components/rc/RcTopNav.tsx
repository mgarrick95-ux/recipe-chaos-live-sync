"use client";

import React from "react";

export type RcTopNavProps = {
  title?: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
};

export default function RcTopNav({
  title,
  left,
  right,
  className = "",
}: RcTopNavProps) {
  return (
    <div className={`py-6 ${className}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          {left ? <div className="shrink-0">{left}</div> : null}
          <div className="min-w-0">
            {title ? (
              <div className="text-3xl md:text-4xl font-extrabold tracking-tight truncate">
                {title}
              </div>
            ) : null}
          </div>
        </div>

        {right ? <div className="flex items-center gap-2">{right}</div> : null}
      </div>
    </div>
  );
}
