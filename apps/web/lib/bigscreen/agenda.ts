import { addDays, type CalendarEvent, dayOf, toStockholm } from "@/lib/calendar/ics";

// "Dagens schema" (the agenda block): the event that just ended (dimmed),
// what's left of today top to bottom with the event that is on now and the
// one after it marked, then the first few events of tomorrow. Times are Stockholm wall time strings, so they
// compare as text ("2026-10-29T18:15").

export type AgendaStatus = "done" | "now" | "next" | "later";

export interface AgendaRow {
  event: CalendarEvent;
  status: AgendaStatus;
}

export interface Agenda {
  today: string;
  tomorrow: string;
  /** The last event that ended today ("done"), then all-day and timed events that haven't ended. */
  rows: AgendaRow[];
  /** The first `tomorrowCount` events of tomorrow (all-day first). */
  next: CalendarEvent[];
}

const byStart = (a: CalendarEvent, b: CalendarEvent) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start);

export function buildAgenda(events: CalendarEvent[], now: Date, tomorrowCount: number): Agenda {
  const clock = toStockholm(now);
  const today = clock.slice(0, 10);
  const tomorrow = addDays(today, 1);

  const left = events
    .filter((e) => dayOf(e) === today)
    // An event without an end is over once it has started.
    .filter((e) => e.allDay || (e.end ?? e.start) > clock)
    .sort(byStart);

  let nextMarked = false;
  const rows = left.map((event): AgendaRow => {
    if (event.allDay) return { event, status: "later" };
    if (event.start <= clock) return { event, status: "now" };
    if (!nextMarked) {
      nextMarked = true;
      return { event, status: "next" };
    }
    return { event, status: "later" };
  });

  const next = events
    .filter((e) => dayOf(e) === tomorrow)
    .sort(byStart)
    .slice(0, tomorrowCount);
  // The most recent event that has ended today, for context.
  const prev = events
    .filter((e) => !e.allDay && dayOf(e) === today && (e.end ?? e.start) <= clock)
    .sort((a, b) => (a.end ?? a.start).localeCompare(b.end ?? b.start))
    .at(-1);
  if (prev) rows.unshift({ event: prev, status: "done" });
  return { today, tomorrow, rows, next };
}
