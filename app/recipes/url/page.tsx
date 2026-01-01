// app/recipes/url/page.tsx
import { redirect } from "next/navigation";

export default function RecipesUrlRedirectPage() {
  redirect("/recipes/clip");
}
