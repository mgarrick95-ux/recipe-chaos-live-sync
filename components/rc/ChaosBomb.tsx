// components/rc/ChaosBomb.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type Props = {
  onBoom?: () => void;
  title?: string;
};

type Particle = {
  id: number;
  x: number;
  y: number;
  r: number;
  rot: number;
  delay: number;
  dur: number;
};

export default function ChaosBomb({ onBoom, title }: Props) {
  const [boom, setBoom] = useState(false);

  const parts = useMemo<Particle[]>(() => {
    const out: Particle[] = [];
    for (let i = 0; i < 18; i++) {
      const ang = (Math.PI * 2 * i) / 18;
      const dist = 22 + Math.random() * 22;
      out.push({
        id: i,
        x: Math.cos(ang) * dist,
        y: Math.sin(ang) * dist,
        r: 6 + Math.random() * 8,
        rot: Math.random() * 360,
        delay: Math.random() * 0.06,
        dur: 0.35 + Math.random() * 0.18,
      });
    }
    return out;
  }, []);

  useEffect(() => {
    if (!boom) return;
    const t = window.setTimeout(() => setBoom(false), 650);
    return () => window.clearTimeout(t);
  }, [boom]);

  return (
    <button
      type="button"
      title={title || "Boom."}
      aria-label="Boom"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setBoom(true);
        onBoom?.();
      }}
      className="group relative ml-2 inline-flex h-11 w-11 items-center justify-center select-none"
      style={{ background: "transparent" }}
    >
      {/* pop */}
      {boom ? (
        <div className="pointer-events-none absolute inset-0">
          {parts.map((p) => (
            <span
              key={p.id}
              className="absolute left-1/2 top-1/2 block"
              style={{
                transform: `translate(-50%,-50%) translate(${p.x}px, ${p.y}px) rotate(${p.rot}deg)`,
                transition: `transform ${p.dur}s ease-out ${p.delay}s, opacity ${p.dur}s ease-out ${p.delay}s`,
                opacity: 0,
              }}
            >
              <span
                className="block rounded-[10px] ring-1 ring-white/10"
                style={{
                  width: p.r,
                  height: p.r * 1.6,
                  background:
                    "linear-gradient(180deg, rgba(232,121,249,0.95), rgba(59,130,246,0.95))",
                  boxShadow: "0 0 16px rgba(232,121,249,0.25)",
                }}
              />
            </span>
          ))}
          <span
            className="pointer-events-none absolute -left-2 -top-3 text-[11px] font-extrabold"
            style={{
              color: "rgba(255,255,255,0.85)",
              textShadow: "0 2px 12px rgba(0,0,0,0.55)",
              transform: "rotate(-12deg)",
            }}
          >
            POOF!
          </span>
          <span
            className="pointer-events-none absolute -right-3 -bottom-3 text-[11px] font-extrabold"
            style={{
              color: "rgba(255,255,255,0.75)",
              textShadow: "0 2px 12px rgba(0,0,0,0.55)",
              transform: "rotate(10deg)",
            }}
          >
            💥
          </span>
        </div>
      ) : null}

      {/* bomb body */}
      <span
        className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition"
        style={{
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.12), 0 0 26px rgba(232,121,249,0.16)",
        }}
      />

      <span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(232,121,249,0.28), rgba(59,130,246,0.12) 55%, rgba(0,0,0,0) 75%)",
        }}
      />

      <span
        className="absolute left-1/2 top-1/2 block h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-white/10"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))",
          boxShadow:
            "0 16px 28px rgba(0,0,0,0.35), 0 0 22px rgba(232,121,249,0.08)",
        }}
      />

      <span
        className="absolute left-1/2 top-1/2 block h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.22), rgba(16,24,64,0.88) 55%)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      />

      <span
        className="absolute left-1/2 top-1/2 block h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(232,121,249,1), rgba(59,130,246,1))",
          boxShadow: "0 0 18px rgba(232,121,249,0.35)",
        }}
      />

      {/* fuse + spark */}
      <span
        className="absolute left-[62%] top-[22%] block h-2.5 w-2.5 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.75), rgba(255,255,255,0.10))",
        }}
      />

      <span
        className="absolute left-[63%] top-[20%] h-4 w-4 origin-bottom-left rotate-[18deg]"
        aria-hidden="true"
      >
        <span
          className="absolute left-0 top-0 h-1.5 w-2.5 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, rgba(245,158,11,1), rgba(239,68,68,1), rgba(232,121,249,1))",
            boxShadow: "0 0 14px rgba(245,158,11,0.35)",
          }}
        />
        <span
          className="absolute left-2 top-[2px] h-2 w-2 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, rgba(245,158,11,1), rgba(239,68,68,1))",
            boxShadow: "0 0 18px rgba(239,68,68,0.35)",
            opacity: boom ? 0.25 : 1,
            transform: boom ? "scale(1.25)" : "scale(1)",
            transition: "transform 220ms ease, opacity 220ms ease",
          }}
        />
      </span>
    </button>
  );
}
