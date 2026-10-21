const DATE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "long", year: "numeric" });

export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20))}…`;
}
