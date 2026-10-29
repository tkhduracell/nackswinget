import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { type AgendaStatus, buildAgenda } from "@/lib/bigscreen/agenda";
import { SHOW_SIGNAL_SCRIPT } from "@/lib/bigscreen/engine";
import { loadEvents } from "@/lib/calendar/fetch";
import { type CalendarEvent, timeOf } from "@/lib/calendar/ics";
import { getSite } from "@/lib/content/cached";

export const metadata: Metadata = { title: "Dagens schema för storbild", robots: { index: false, follow: false } };

// The "Dagens schema" block: today's remaining schedule as an old-style TV
// guide, top to bottom, then the first events of tomorrow.
// ?feeds=a,b limits the calendars (default all), ?imorgon=N tomorrow's rows.
export default function StorbildAgenda({ searchParams }: PageProps<"/storbild/dagens">) {
  return (
    <main className="bs-content bs-agenda">
      <script dangerouslySetInnerHTML={{ __html: SHOW_SIGNAL_SCRIPT }} />
      <Suspense>
        <AgendaScreen searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const TZ = "Europe/Stockholm";
const dayTitle = (day: string) => new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date(`${day}T12:00:00Z`));
const STATUS_LABEL: Record<AgendaStatus, string | null> = { done: null, now: "Pågår nu", next: "Härnäst", later: null };

/** Local dev only: ?nu=18:30 shows the agenda as at that time today. */
function devNow(nu: string | string[] | undefined): Date | null {
  if (process.env.NODE_ENV === "production" || typeof nu !== "string" || !/^\d{2}:\d{2}$/.test(nu)) return null;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date());
  // Stockholm is UTC+1 in winter and UTC+2 in summer; close enough for a dev preview.
  return new Date(`${today}T${nu}:00+01:00`);
}

function timeLabel(e: CalendarEvent): string {
  if (e.allDay) return "Heldag";
  const end = timeOf(e.end);
  return end ? `${timeOf(e.start)}–${end}` : (timeOf(e.start) ?? "");
}

function Row({ event, status, index }: { event: CalendarEvent; status: AgendaStatus | "tomorrow"; index: number }) {
  const label = status === "tomorrow" ? null : STATUS_LABEL[status];
  return (
    <li className={`bs-ag-row is-${status}`} style={{ ["--i" as string]: index }}>
      <span className="bs-ag-time">{timeLabel(event)}</span>
      <span className="bs-ag-title">
        {event.title}
        {event.location && <span className="bs-ag-where"> · {event.location}</span>}
      </span>
      {label && <span className="bs-ag-badge">{label}</span>}
    </li>
  );
}

async function AgendaScreen({ searchParams }: { searchParams: PageProps<"/storbild/dagens">["searchParams"] }) {
  const [{ feeds: picked, imorgon, nu }, { settings }] = await Promise.all([searchParams, getSite()]);
  const wanted = typeof picked === "string" ? picked.split(",").filter(Boolean) : [];
  const feeds = settings.calendarFeeds.filter((f) => !wanted.length || wanted.includes(f.key));
  const events = await loadEvents(feeds);
  // Renders per request: "now" moves, and each showing of the block loads the page anew.
  await connection();
  const now = devNow(nu) ?? new Date();
  const tomorrowCount = Math.max(0, Math.min(6, Number(imorgon ?? 2) || 0));
  const { today, tomorrow, rows, next } = buildAgenda(events, now, tomorrowCount);
  const clock = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(now);

  return (
    <div className="bs-ag">
      <header className="bs-ag-head">
        <div>
          <p className="bs-ag-kicker">Dansklubben Nackswinget</p>
          <h1>Dagens schema</h1>
        </div>
        <div className="bs-ag-clock">
          <span className="bs-ag-hhmm">{clock}</span>
          <span className="bs-ag-date">{dayTitle(today)}</span>
        </div>
      </header>
      {rows.length > 0 && (
        <ul className="bs-ag-list bs-ag-today">
          {rows.map((r, i) => (
            <Row key={`${r.event.uid}-${r.event.start}`} event={r.event} status={r.status} index={i} />
          ))}
        </ul>
      )}
      {!rows.some((r) => r.status !== "done") && <p className="bs-ag-empty">Inga fler aktiviteter idag</p>}
      {next.length > 0 && (
        <section className="bs-ag-tomorrow" style={{ ["--i" as string]: rows.length }}>
          <h2>I morgon, {dayTitle(tomorrow)}</h2>
          <ul className="bs-ag-list">
            {next.map((e, i) => (
              <Row key={`${e.uid}-${e.start}`} event={e} status="tomorrow" index={rows.length + 1 + i} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
