import { Suspense } from "react";
import ClipRecipeClient from "./ClipRecipeClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading clipper…</div>}>
      <ClipRecipeClient />
    </Suspense>
  );
}
