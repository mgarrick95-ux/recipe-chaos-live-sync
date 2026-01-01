"use client";

import React from "react";

export type RecipeFormValues = {
  title: string;
  description: string;
  tags: string;
  favorite: boolean;
  servings: string;
  prep_minutes: string;
  cook_minutes: string;
  source_url: string;
  source_name: string;
  ingredientsText: string;
  instructionsText: string;
};

export const defaultRecipeFormValues: RecipeFormValues = {
  title: "",
  description: "",
  tags: "",
  favorite: false,
  servings: "",
  prep_minutes: "",
  cook_minutes: "",
  source_url: "",
  source_name: "",
  ingredientsText: "",
  instructionsText: "",
};

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

export function RecipeForm(props: {
  values: RecipeFormValues;
  onChange: (next: RecipeFormValues) => void;
  onSubmit: () => void;
  submitLabel?: string;
  topLeftSlot?: React.ReactNode;
  topRightSlot?: React.ReactNode;
  disabled?: boolean;
  notice?: React.ReactNode;
}) {
  const {
    values,
    onChange,
    onSubmit,
    submitLabel = "Save",
    topLeftSlot,
    topRightSlot,
    disabled,
    notice,
  } = props;

  /**
   * High-contrast dark motif.
   * IMPORTANT: `disabled` only disables submit buttons (NOT form fields),
   * because some parent pages keep disabled=true during load/save states.
   */

  const pageWrap = "max-w-5xl text-white";

  const sectionCard =
    "rounded-3xl bg-black/35 ring-1 ring-white/14 p-5 shadow-sm backdrop-blur";

  const sectionTitle = "mb-3 text-lg font-black tracking-tight text-white";

  const labelBase = "text-sm font-semibold text-white";
  const hintBase = "text-xs text-white/70";

  const inputBase =
    "w-full rounded-2xl bg-black/45 px-4 py-3 text-sm text-white " +
    "ring-1 ring-white/18 outline-none transition " +
    "placeholder:text-white/45 " +
    "focus:ring-2 focus:ring-fuchsia-400/55 focus:bg-black/55";

  const checkboxBase =
    "h-5 w-5 rounded border border-white/25 bg-black/40 accent-fuchsia-500";

  const pill =
    "inline-flex items-center gap-2 rounded-full bg-white/12 hover:bg-white/18 " +
    "px-6 py-3 font-semibold ring-1 ring-white/14 transition " +
    "disabled:opacity-50 disabled:cursor-not-allowed";

  const pillPrimary =
    "inline-flex items-center gap-2 rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 " +
    "px-6 py-3 font-semibold text-white shadow-lg shadow-fuchsia-500/25 transition " +
    "disabled:opacity-50 disabled:cursor-not-allowed";

  function set<K extends keyof RecipeFormValues>(key: K, val: RecipeFormValues[K]) {
    onChange({ ...values, [key]: val });
  }

  return (
    <div className={pageWrap}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">{topLeftSlot}</div>

        <div className="flex items-center gap-3">
          {topRightSlot}
          <button
            type="button"
            className={pillPrimary}
            onClick={onSubmit}
            disabled={disabled}
          >
            {submitLabel}
          </button>
        </div>
      </div>

      {notice ? (
        <div className="mb-5 rounded-2xl border border-red-500/35 bg-red-500/15 px-4 py-3 text-sm text-red-100">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-6">
        <section className={sectionCard}>
          <div className={sectionTitle}>Basics</div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <div className={labelBase}>Title *</div>
              <input
                className={inputBase}
                value={values.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g., Lasagna"
              />
            </div>

            <div className="md:col-span-2">
              <div className={labelBase}>Description</div>
              <textarea
                className={cx(inputBase, "min-h-[100px]")}
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Optional short note"
              />
            </div>

            <div className="md:col-span-2">
              <div className={labelBase}>Tags</div>
              <div className={hintBase}>Comma-separated</div>
              <input
                className={inputBase}
                value={values.tags}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="Pasta, Comfort, Weeknight"
              />
            </div>

            <label className="flex items-center gap-3 text-sm font-semibold text-white">
              <input
                type="checkbox"
                className={checkboxBase}
                checked={values.favorite}
                onChange={(e) => set("favorite", e.target.checked)}
              />
              Favorite
            </label>
          </div>
        </section>

        <section className={sectionCard}>
          <div className={sectionTitle}>Timing + Source</div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className={labelBase}>Servings</div>
              <input
                className={inputBase}
                value={values.servings}
                onChange={(e) => set("servings", e.target.value)}
                placeholder="e.g., 4"
                inputMode="numeric"
              />
            </div>

            <div>
              <div className={labelBase}>Prep (min)</div>
              <input
                className={inputBase}
                value={values.prep_minutes}
                onChange={(e) => set("prep_minutes", e.target.value)}
                placeholder="e.g., 15"
                inputMode="numeric"
              />
            </div>

            <div>
              <div className={labelBase}>Cook (min)</div>
              <input
                className={inputBase}
                value={values.cook_minutes}
                onChange={(e) => set("cook_minutes", e.target.value)}
                placeholder="e.g., 45"
                inputMode="numeric"
              />
            </div>

            <div>
              <div className={labelBase}>Source URL</div>
              <input
                className={inputBase}
                value={values.source_url}
                onChange={(e) => set("source_url", e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="md:col-span-2">
              <div className={labelBase}>Source Name</div>
              <input
                className={inputBase}
                value={values.source_name}
                onChange={(e) => set("source_name", e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
        </section>

        <section className={sectionCard}>
          <div className={sectionTitle}>Ingredients + Instructions</div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className={labelBase}>Ingredients (one per line)</div>
              <textarea
                className={cx(inputBase, "min-h-[240px] font-mono text-sm leading-6")}
                value={values.ingredientsText}
                onChange={(e) => set("ingredientsText", e.target.value)}
                placeholder={"1 lb ground beef\n1 onion\n2 cups cheese"}
              />
            </div>

            <div>
              <div className={labelBase}>Instructions (one per line)</div>
              <textarea
                className={cx(inputBase, "min-h-[240px] font-mono text-sm leading-6")}
                value={values.instructionsText}
                onChange={(e) => set("instructionsText", e.target.value)}
                placeholder={"Boil noodles\nCook meat sauce\nCombine and bake"}
              />
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={pill}
          onClick={onSubmit}
          disabled={disabled}
        >
          {submitLabel}
        </button>

        <div className={hintBase}>
          Tip: keep ingredients/instructions one per line — it stays predictable.
        </div>
      </div>
    </div>
  );
}
