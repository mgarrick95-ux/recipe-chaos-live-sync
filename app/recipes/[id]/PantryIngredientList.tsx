"use client";

import { useState } from "react";

export type MatchState = "matched" | "partial" | "missing" | "planned";

export type IngredientMatchInfo = {
  state: MatchState;
  pantryItem?: string | null;
  quantityAvailable?: number | null;
  matchKind?: string | null;
  isSoftMatch?: boolean;
  inShoppingList?: boolean;
  shoppingListItemName?: string | null;
};

type Props = {
  ingredients: string[];
  matchByIngredient: Record<string, IngredientMatchInfo>;
};

function getMarker(state: MatchState | undefined, isAdded: boolean) {
  if (state === "matched") return "✓";
  if (state === "partial") return "?";
  if (state === "planned") return "▤";
  if (state === "missing") return isAdded ? "✓" : "✕";
  return "•";
}

function getMarkerClass(state: MatchState | undefined, isAdded: boolean) {
  if (state === "matched") return "text-green-400";
  if (state === "partial") return "text-yellow-400";
  if (state === "planned") return "text-cyan-300";
  if (state === "missing") return isAdded ? "text-green-400" : "text-red-400";
  return "text-white/40";
}

function getMatchLabel(match: IngredientMatchInfo | undefined) {
  if (match?.state === "planned") {
    return match.shoppingListItemName
      ? `On shopping list: ${match.shoppingListItemName}`
      : "On shopping list";
  }

  if (!match || match.state !== "partial" || !match.pantryItem) return null;

  if (match.matchKind === "containment") {
    return `Similar: ${match.pantryItem}`;
  }

  if (match.matchKind === "token") {
    return `Possible: ${match.pantryItem}`;
  }

  return `Maybe: ${match.pantryItem}`;
}

export default function PantryIngredientList({ ingredients, matchByIngredient }: Props) {
  const [added, setAdded] = useState<Record<string, boolean>>({});

  async function addMissingToShoppingList(ingredient: string) {
    const state = matchByIngredient[ingredient]?.state;
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
        const match = matchByIngredient[ing];
        const state = match?.state;
        const isAdded = added[ing];
        const matchLabel = getMatchLabel(match);

        return (
          <li
            key={`${ing}-${idx}`}
            className={state === "missing" ? "flex gap-2 cursor-pointer" : "flex gap-2"}
            onClick={() => addMissingToShoppingList(ing)}
          >
            <span className={getMarkerClass(state, Boolean(isAdded))}>
              {state === "missing" && !isAdded ? <span className="text-xs">{getMarker(state, Boolean(isAdded))}</span> : getMarker(state, Boolean(isAdded))}
            </span>

            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2">
                <span className={isAdded ? "text-green-400" : "text-white/85"}>{ing}</span>

                {isAdded ? <span className="text-xs text-green-400 opacity-80">Added</span> : null}
              </span>

              {matchLabel ? <span className="text-xs text-yellow-300/85">{matchLabel}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

