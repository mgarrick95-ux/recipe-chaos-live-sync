import { Suspense } from "react";
import ClipRecipeClient from "@/app/recipes/clip/ClipRecipeClient";

export default function AddRecipeUrlPage() {
  return (
    <Suspense fallback={null}>
      <ClipRecipeClient />
    </Suspense>
  );
}
