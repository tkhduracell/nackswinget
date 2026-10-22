const DATE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "long", year: "numeric" });

export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}

const SHORT = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "short", year: "numeric" });

/** "16 okt. 2026" -> "16 okt 2026" (post lists, like the old theme's "okt 16, 2026"). */
export function formatShortDate(iso: string): string {
  return SHORT.format(new Date(iso)).replace(".", "");
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20))}…`;
}
