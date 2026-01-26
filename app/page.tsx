// app/page.tsx
import Link from "next/link";

function SoftCard({
  title,
  desc,
  href,
  icon,
}: {
  title: string;
  desc: string;
  href: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl bg-white/8 ring-1 ring-white/12 p-5 shadow-lg backdrop-blur-md transition hover:bg-white/10"
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl">{icon}</div>
        <div className="min-w-0">
          <div className="text-lg font-extrabold tracking-tight">{title}</div>
          <div className="mt-1 text-sm text-white/70">{desc}</div>
          <div className="mt-4 text-xs text-white/55 group-hover:text-white/70">Open →</div>
        </div>
      </div>
    </Link>
  );
}

export default function HomePage() {
  return (
    <main className="min-h-screen rc-spark text-white">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-white/10">
        {/* Decorative layer */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-28 -left-28 h-[360px] w-[360px] rounded-full bg-white/8 blur-3xl" />
          <div className="absolute -bottom-36 -right-28 h-[460px] w-[460px] rounded-full bg-white/6 blur-3xl" />
          <div className="absolute inset-0 rc-speckle opacity-[0.55]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pt-12 pb-10">
          <div className="max-w-2xl">
            <h1 className="text-5xl font-extrabold tracking-tight leading-[1.05]">
              Decide what to cook, without the chaos.
            </h1>
            <p className="mt-4 text-white/75 text-lg">
              Use what you’ve got. Make a plan if you feel like it. Nothing is a commitment.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/recipes"
                className="inline-flex items-center justify-center rounded-full bg-white/12 hover:bg-white/16 px-6 py-3 font-semibold ring-1 ring-white/12 transition"
              >
                Open Recipes
              </Link>
              <Link
                href="/meal-planning"
                className="inline-flex items-center justify-center rounded-full bg-white/6 hover:bg-white/10 px-6 py-3 font-semibold ring-1 ring-white/10 transition"
              >
                Go to Meal Planning
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-5 md:grid-cols-3">
          <SoftCard title="Recipes" desc="Store and revisit meals you actually make." href="/recipes" icon="📖" />
          <SoftCard title="Pantry & Freezer" desc="Track what’s actually in stock." href="/frostpantry" icon="🧊" />
          <SoftCard title="Meal Planning" desc="Simple, flexible meal ideas — no pressure." href="/meal-planning" icon="🗓" />
        </div>

        <div className="mt-10 text-xs text-white/45">
          P.S. If you skip planning, the app does not take it personally.
        </div>
      </div>
    </main>
  );
}
