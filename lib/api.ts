export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await res.text();

  if (text.trim().startsWith("<!DOCTYPE")) {
    throw new Error("HTML returned instead of JSON (wrong route hit)");
  }

  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(json?.error || "Request failed");
  }

  return json as T;
}
