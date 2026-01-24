import { Suspense } from "react";
import AutoMealPlanningClient from "./AutoMealPlanningClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading smart plan…</div>}>
      <AutoMealPlanningClient />
    </Suspense>
  );
}
