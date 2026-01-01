"use client";

// app/components/WeekSnapshot.tsx
import Link from "next/link";
import { useMemo, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Recipe = { id: string; title: string };
type Plan = { selected_recipe_ids?: string[] };

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfWeekMonday(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default function WeekSnapshot() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const startParam = searchParams.get("start");
  const weekStart = useMemo(() => {
    if (startParam) {
      const parsed = new Date(`${startParam}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) return startOfWeekMonday(parsed);
    }
    return startOfWeekMonday(new Date());
  }, [startParam]);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const weekStartStr = useMemo(() => toISODate(weekStart), [weekStart]);
  const weekEndStr = useMemo(() => toISODate(weekEnd), [weekEnd]);

  const [titles, setTitles] = useState<string[]>([]);
  const [count, setCount] = useState<number>(0);

  // refresh when week changes OR when you move around pages (so it stays feeling “live”)
  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [planRes, recipesRes] = await Promise.all([
          fetch(`/api/meal-plans/current?start=${weekStartStr}`, { cache: "no-store" }),
          fetch(`/api/recipes`, { cache: "no-store" }),
        ]);

        const planJson = await planRes.json().catch(() => null);
        const recipesJson = await recipesRes.json().catch(() => null);

        const plan: Plan | null = planRes.ok ? planJson?.plan ?? planJson : null;
        const list: Recipe[] = Array.isArray(recipesJson) ? recipesJson : recipesJson?.recipes ?? [];

        const byId = new Map(list.map((r) => [r.id, r.title]));
        const ids = (plan?.selected_recipe_ids ?? []).filter(Boolean);
        const pickedTitles = ids.map((id) => byId.get(id) || "Unknown recipe").filter(Boolean);

        if (!alive) return;
        setCount(pickedTitles.length);
        setTitles(pickedTitles.slice(0, 3));
      } catch {
        if (!alive) return;
        setCount(0);
        setTitles([]);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [weekStartStr, pathname]);

  return (
    <div>
      <div className="rc-snapshotTitleRow">
        <div className="rc-snapshotTitle">Week</div>
        <Link className="rc-btn" href={`/meal-planning?start=${weekStartStr}`}>
          Open
        </Link>
      </div>

      <div className="rc-snapshotRange">
        {weekStartStr} → {weekEndStr}
      </div>

      <div className="rc-muted" style={{ marginTop: 8 }}>
        {count} selected
      </div>

      {titles.length > 0 ? (
        <ul className="rc-bullets">
          {titles.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : (
        <div className="rc-muted" style={{ marginTop: 10 }}>
          Nothing picked yet.
        </div>
      )}

      {count > 3 ? <div className="rc-muted">+{count - 3} more</div> : null}
    </div>
  );
}
