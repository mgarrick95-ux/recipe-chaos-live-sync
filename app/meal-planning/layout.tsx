// app/meal-planning/layout.tsx
export default function MealPlanningLayout({ children }: { children: React.ReactNode }) {
  // IMPORTANT:
  // This MUST NOT render any sidebar/controls/wrappers.
  // RootLayout already provides the app shell + sidebar.
  return <>{children}</>;
}
