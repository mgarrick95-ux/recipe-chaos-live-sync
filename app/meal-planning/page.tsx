// app/meal-planning/page.tsx
import { Suspense } from "react";
import MealPlanningClient from "./MealPlanningClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading meal plan…</div>}>
      <MealPlanningClient />
    </Suspense>
  );
}
