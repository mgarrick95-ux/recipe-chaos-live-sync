import { Suspense } from "react";
import AddRecipeManualClient from "./AddRecipeManualClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading recipe form…</div>}>
      <AddRecipeManualClient />
    </Suspense>
  );
}
