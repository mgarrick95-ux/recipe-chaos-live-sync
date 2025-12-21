import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="mb-10">
          <h1 className="text-3xl font-bold">RecipeChaos</h1>
          <p className="mt-2 text-slate-300">
            AI-assisted meal planning that actually respects your pantry & freezer.
          </p>
        </header>

        {/* FrostPantry intro */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">FrostPantry</h2>
          <p className="text-slate-300">
            Track what you have in your pantry and freezer, then feed it into your
            meal planner.
          </p>

          <div className="flex flex-wrap gap-4">
            <Link
              href="/frostpantry"
              className="inline-flex items-center rounded-md bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-500"
            >
              Open FrostPantry
            </Link>

            <Link
              href="/frostpantry/add"
              className="inline-flex items-center rounded-md border border-fuchsia-400 px-4 py-2 text-sm font-medium text-fuchsia-300 hover:bg-fuchsia-950/60"
            >
              Add Item
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
