// Minimal iCalendar (RFC 5545) reader for the club's own feeds: flat VEVENTs,
// floating local times (Europe/Stockholm), all-day VALUE=DATE events, and
// UTC "Z" times. No recurrence rules are used by the feeds.

export interface CalendarEvent {
  uid: string;
  feed: string;
  title: string;
  location?: string;
  description?: string;
  url?: string;
  allDay: boolean;
  /** Local Stockholm wall time, "YYYY-MM-DDTHH:mm" (or "YYYY-MM-DD" when allDay). */
  start: string;
  end?: string;
}

const TZ = "Europe/Stockholm";

function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescape(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Formats a UTC instant as Stockholm wall time "YYYY-MM-DDTHH:mm". */
export function toStockholm(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function parseDate(params: string, value: string): { value: string; allDay: boolean } | null {
  if (/VALUE=DATE(?!-)/.test(params) || /^\d{8}$/.test(value)) {
    const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
    return m ? { value: `${m[1]}-${m[2]}-${m[3]}`, allDay: true } : null;
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  if (m[7]) {
    const utc = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)));
    return { value: toStockholm(utc), allDay: false };
  }
  // Floating or TZID=Europe/Stockholm: already wall time.
  return { value: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`, allDay: false };
}

export function parseIcs(text: string, feed: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  let cur: Record<string, { params: string; value: string }> | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) {
        const start = cur.DTSTART && parseDate(cur.DTSTART.params, cur.DTSTART.value);
        if (start) {
          let end = cur.DTEND ? parseDate(cur.DTEND.params, cur.DTEND.value) : null;
          // All-day DTEND is exclusive; store the inclusive last day.
          if (end && start.allDay && end.allDay) {
            const d = new Date(`${end.value}T00:00:00Z`);
            d.setUTCDate(d.getUTCDate() - 1);
            const last = d.toISOString().slice(0, 10);
            end = last > start.value ? { value: last, allDay: true } : null;
          }
          events.push({
            uid: cur.UID?.value ?? `${feed}-${start.value}-${cur.SUMMARY?.value ?? ""}`,
            feed,
            title: unescape(cur.SUMMARY?.value ?? "(utan titel)"),
            ...(cur.LOCATION?.value ? { location: unescape(cur.LOCATION.value) } : {}),
            ...(cur.DESCRIPTION?.value ? { description: unescape(cur.DESCRIPTION.value) } : {}),
            ...(cur.URL?.value ? { url: cur.URL.value.trim() } : {}),
            allDay: start.allDay,
            start: start.value,
            ...(end ? { end: end.value } : {}),
          });
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const semi = head.indexOf(";");
    const name = (semi < 0 ? head : head.slice(0, semi)).toUpperCase();
    cur[name] = { params: semi < 0 ? "" : head.slice(semi + 1), value: line.slice(colon + 1) };
  }
  return events;
}

/** Sorts and drops duplicate events that appear in several feeds (same UID). */
export function mergeEvents(lists: CalendarEvent[][]): CalendarEvent[] {
  const seen = new Set<string>();
  const out: CalendarEvent[] = [];
  for (const e of lists.flat()) {
    const key = `${e.uid}|${e.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

export function dayOf(e: CalendarEvent): string {
  return e.start.slice(0, 10);
}

export function timeOf(value: string | undefined): string | null {
  return value && value.length > 10 ? value.slice(11, 16) : null;
}

/** Today's date in Stockholm, "YYYY-MM-DD". */
export function todayStockholm(now = new Date()): string {
  return toStockholm(now).slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday 1 (Mon) .. 7 (Sun) for "YYYY-MM-DD". */
export function isoWeekday(day: string): number {
  const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function isoWeek(day: string): number {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - isoWeekday(day));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export { pad };
