"use client";

import { useState } from "react";

type MatchState = "matched" | "partial" | "missing";

type Props = {
  ingredients: string[];
  matchEntries: [string, MatchState][];
};

export default function PantryIngredientList({ ingredients, matchEntries }: Props) {
  const matchMap = new Map<string, MatchState>(matchEntries);
  const [added, setAdded] = useState<Record<string, boolean>>({});

  async function addMissingToShoppingList(ingredient: string) {
    const state = matchMap.get(ingredient);
    if (state !== "missing") return;
    if (added[ingredient]) return;

    const res = await fetch("/api/shopping-list/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: ingredient, quantity: 1 }),
    });

    if (!res.ok) return;

    setAdded((prev) => ({ ...prev, [ingredient]: true }));
  }

  return (
    <ul className="mt-4 list-none pl-0 leading-relaxed text-white/85 space-y-2">
      {ingredients.map((ing, idx) => {
        const state = matchMap.get(ing);
        const isAdded = added[ing];

        return (
          <li
            key={`${ing}-${idx}`}
            className={state === "missing" ? "flex gap-2 cursor-pointer" : "flex gap-2"}
            onClick={() => addMissingToShoppingList(ing)}
          >
            <span
              className={
                state === "matched"
                  ? "text-green-400"
                  : state === "partial"
                    ? "text-yellow-400"
                    : state === "missing"
                      ? isAdded
                        ? "text-green-400"
                        : "text-red-400"
                      : "text-white/40"
              }
            >
              {state === "matched"
                ? "✓"
                : state === "partial"
                  ? "?"
                  : state === "missing"
                    ? isAdded
                      ? "✓"
                      : <span className="text-xs">✕</span>
                    : "•"}
            </span>

            <span className="flex items-center gap-2">
  <span className={isAdded ? "text-green-400" : "text-white/85"}>
    {ing}
  </span>

  {isAdded ? (
    <span className="text-xs text-green-400 opacity-80">
      Added
    </span>
  ) : null}
</span>
          </li>
        );
      })}
    </ul>
  );
}
