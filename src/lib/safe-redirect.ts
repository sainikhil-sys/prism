/** Accepts only same-site absolute paths, so `next` parameters cannot redirect off-site. */
export function safeNext(value: string | null | undefined, fallback = "/app"): string {
  if (!value || typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(value)) return fallback;
  return value;
}
