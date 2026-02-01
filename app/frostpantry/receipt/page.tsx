// app/frostpantry/receipt/page.tsx

import Link from "next/link";
import PageHero from "@/components/ui/PageHero";
import ReceiptScanTool from "@/components/frostpantry/ReceiptScanTool";

export default function FrostPantryReceiptPage() {
  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <PageHero
        title="Pantry"
        subtitle="Let’s see what you have."
        action={
          <Link
            href="/frostpantry"
            className="rounded-full bg-white/10 hover:bg-white/15 px-5 py-3 font-semibold ring-1 ring-white/10"
          >
            ← Back
          </Link>
        }
        chaosTheme="pantry"
      />

      <div className="max-w-6xl mx-auto px-4 pb-12">
        <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-6">
          <div className="text-2xl font-extrabold tracking-tight">
            Scan receipt
          </div>
          <div className="mt-1 text-white/65">
            Paste text or upload photos. Review first. Add only what you want.
          </div>

          <div className="mt-6">
            <ReceiptScanTool />
          </div>
        </div>
      </div>
    </div>
  );
}
