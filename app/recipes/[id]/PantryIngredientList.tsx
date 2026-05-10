"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type MatchState = "matched" | "partial" | "missing" | "planned";

export type IngredientMatchInfo = {
  state: MatchState;
  pantryItem?: string | null;
  quantityAvailable?: number | null;
  matchKind?: string | null;
  isSoftMatch?: boolean;
  inShoppingList?: boolean;
  shoppingListItemName?: string | null;
  matchedStorageItemId?: string | null;
  matchedStorageQuantity?: number | null;
  matchedStorageUnit?: string | null;
  matchedStorageLocation?: string | null;
};

type Props = {
  recipeId: string;
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

function formatQty(quantity?: number | null, unit?: string | null) {
  if (quantity == null) return null;
  if (unit && unit.trim()) return `${quantity} ${unit}`;
  return String(quantity);
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

export default function PantryIngredientList({
  recipeId,
  ingredients,
  matchByIngredient,
}: Props) {
  const router = useRouter();
  const [localMatchByIngredient, setLocalMatchByIngredient] =
    useState<Record<string, IngredientMatchInfo>>(matchByIngredient);
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [usingPantry, setUsingPantry] = useState<Record<string, boolean>>({});
  const [usedPantry, setUsedPantry] = useState<Record<string, string>>({});
  const [usePantryError, setUsePantryError] = useState<Record<string, string>>({});
  const [quantityByIngredient, setQuantityByIngredient] = useState<Record<string, string>>({});

  useEffect(() => {
    setLocalMatchByIngredient(matchByIngredient);
  }, [matchByIngredient]);

  async function addMissingToShoppingList(ingredient: string) {
    const state = localMatchByIngredient[ingredient]?.state;
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

  async function usePantryItem(ingredient: string) {
    const match = localMatchByIngredient[ingredient];

    if (match?.state !== "matched") return;
    if (!match.matchedStorageItemId) return;
    if (usingPantry[ingredient]) return;

    const rawQty = quantityByIngredient[ingredient] ?? "1";
    const quantityUsed = Number(rawQty);

    if (!Number.isFinite(quantityUsed) || quantityUsed <= 0) {
      setUsePantryError((prev) => ({
        ...prev,
        [ingredient]: "Enter a number greater than 0.",
      }));
      return;
    }

    setUsingPantry((prev) => ({ ...prev, [ingredient]: true }));
    setUsePantryError((prev) => ({ ...prev, [ingredient]: "" }));

    try {
      const res = await fetch(`/api/recipes/${recipeId}/use-pantry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageItemId: match.matchedStorageItemId,
          ingredient,
          quantityUsed,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        const message =
          json?.error || "Could not update FrostPantry for that ingredient.";
        setUsePantryError((prev) => ({ ...prev, [ingredient]: message }));
        return;
      }

      const newQuantity = Number(json?.update?.newQuantity ?? NaN);

      setUsedPantry((prev) => ({
        ...prev,
        [ingredient]: json?.summary || "Used from pantry.",
      }));

      router.refresh();

      setLocalMatchByIngredient((prev) => {
        const current = prev[ingredient];
        if (!current) return prev;

        if (Number.isFinite(newQuantity) && newQuantity <= 0) {
          return {
            ...prev,
            [ingredient]: {
              state: current.inShoppingList ? "planned" : "missing",
              pantryItem: null,
              quantityAvailable: null,
              matchKind: null,
              isSoftMatch: false,
              inShoppingList: current.inShoppingList,
              shoppingListItemName: current.shoppingListItemName ?? null,
              matchedStorageItemId: null,
              matchedStorageQuantity: null,
              matchedStorageUnit: null,
              matchedStorageLocation: null,
            },
          };
        }

        return {
          ...prev,
          [ingredient]: {
            ...current,
            quantityAvailable: Number.isFinite(newQuantity)
              ? newQuantity
              : current.quantityAvailable,
            matchedStorageQuantity: Number.isFinite(newQuantity)
              ? newQuantity
              : current.matchedStorageQuantity,
          },
        };
      });
    } catch {
      setUsePantryError((prev) => ({
        ...prev,
        [ingredient]: "Could not update FrostPantry for that ingredient.",
      }));
    } finally {
      setUsingPantry((prev) => ({ ...prev, [ingredient]: false }));
    }
  }

  return (
    <ul className="mt-4 list-none pl-0 leading-relaxed text-white/85 space-y-3">
      {ingredients.map((ing, idx) => {
        const match = localMatchByIngredient[ing];
        const state = match?.state;
        const isAdded = added[ing];
        const matchLabel = getMatchLabel(match);
        const pantryQtyLabel = formatQty(
          match?.matchedStorageQuantity ?? match?.quantityAvailable,
          match?.matchedStorageUnit
        );
        const pantryMeta =
          state === "matched" && match?.pantryItem
            ? [
                match.pantryItem,
                pantryQtyLabel,
                match?.matchedStorageLocation || null,
              ]
                .filter(Boolean)
                .join(" • ")
            : null;

        const canUsePantry =
          state === "matched" &&
          Boolean(match?.matchedStorageItemId);

        return (
          <li
            key={`${ing}-${idx}`}
            className={state === "missing" ? "flex gap-2 cursor-pointer" : "flex gap-2"}
            onClick={() => addMissingToShoppingList(ing)}
          >
            <span className={getMarkerClass(state, Boolean(isAdded))}>
              {state === "missing" && !isAdded ? (
                <span className="text-xs">{getMarker(state, Boolean(isAdded))}</span>
              ) : (
                getMarker(state, Boolean(isAdded))
              )}
            </span>

            <span className="flex flex-col gap-1 min-w-0">
              <span className="flex items-center gap-2 flex-wrap">
                <span className={isAdded ? "text-green-400" : "text-white/85"}>{ing}</span>

                {isAdded ? (
                  <span className="text-xs text-green-400 opacity-80">Added</span>
                ) : null}

                {canUsePantry ? (
                  <>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={quantityByIngredient[ing] ?? "1"}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        setQuantityByIngredient((prev) => ({
                          ...prev,
                          [ing]: event.target.value,
                        }))
                      }
                      className="w-16 rounded-lg bg-white/10 px-2 py-1 text-xs text-white ring-1 ring-white/10 outline-none"
                      aria-label={`Quantity to use for ${ing}`}
                    />

                    <button
                      type="button"
                      className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-200 ring-1 ring-emerald-400/20 hover:bg-emerald-500/25"
                      onClick={(event) => {
                        event.stopPropagation();
                        void usePantryItem(ing);
                      }}
                      disabled={Boolean(usingPantry[ing])}
                    >
                      {usingPantry[ing] ? "Using..." : "Use Pantry"}
                    </button>
                  </>
                ) : null}
              </span>

              {pantryMeta ? (
                <span className="text-xs text-emerald-200/80">{pantryMeta}</span>
              ) : null}

              {matchLabel ? (
                <span className="text-xs text-yellow-300/85">{matchLabel}</span>
              ) : null}

              {usedPantry[ing] ? (
                <span className="text-xs text-emerald-300/85">{usedPantry[ing]}</span>
              ) : null}

              {usePantryError[ing] ? (
                <span className="text-xs text-rose-300/90">{usePantryError[ing]}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}




