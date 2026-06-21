/** Parse JSON API responses; surface plain-text Vercel errors clearly. */
export async function fetchJson<T>(url: string, fallbackError: string): Promise<T> {
  const res = await fetch(url);
  const text = await res.text();

  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    const snippet = text.trim().slice(0, 120);
    throw new Error(
      res.ok
        ? "Server returned invalid JSON"
        : snippet.includes("server error")
          ? "Server error — API may be misconfigured on Vercel"
          : snippet || fallbackError
    );
  }

  if (!res.ok) {
    const err =
      data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : fallbackError;
    throw new Error(err);
  }

  return data as T;
}
