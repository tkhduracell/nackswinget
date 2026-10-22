import { cacheLife, cacheTag } from "next/cache";
import { loadEvents } from "@/lib/calendar/fetch";
import { addDays, type CalendarEvent, dayOf, isoWeek, isoWeekday, timeOf, todayStockholm } from "@/lib/calendar/ics";
import type { CalendarFeed, Section } from "@/lib/content/types";
import { CalendarControls } from "./CalendarControls";

type CalendarSection = Extract<Section, { type: "calendar" }>;

const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const WEEKDAYS = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];
const WEEKDAYS_SHORT = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const name = MONTHS[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${y}`;
}

function dayLabel(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${WEEKDAYS_SHORT[isoWeekday(day) - 1]} ${d} ${MONTHS[m - 1]}`;
}

/** The old list widget's solid colours (white text); feeds not listed use their own colour. */
const LIST_COLORS: Record<string, string> = {
  huvud: "#800080",
  kurs: "#ffa500",
  tavlingskalender: "#2980b9",
  event: "#f9064b",
  fritraning: "#008000",
};

/** "tor 22/10", like the old theme's list widget. */
function shortDay(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${WEEKDAYS_SHORT[isoWeekday(day) - 1].toLowerCase()} ${d}/${m}`;
}

function timeRange(e: CalendarEvent): string {
  if (e.allDay) return "Heldag";
  const s = timeOf(e.start);
  const end = timeOf(e.end);
  return end && e.end?.slice(0, 10) === dayOf(e) ? `${s}–${end}` : (s ?? "");
}

function EventItem({ e, color, startOnly }: { e: CalendarEvent; color: string; startOnly?: boolean }) {
  const hasDetails = !!(e.location || e.description || e.url);
  const head = (
    <>
      <span className="ev-time">{startOnly && !e.allDay ? timeOf(e.start) : timeRange(e)}</span> <span className="ev-title">{e.title}</span>
    </>
  );
  return (
    <li className="ev" data-feed={e.feed} style={{ ["--ev-color" as string]: color }}>
      {hasDetails ? (
        <details>
          <summary>{head}</summary>
          <div className="ev-details">
            {e.location && <p>📍 {e.location}</p>}
            {e.description && <p className="ev-desc">{e.description}</p>}
            {e.url && (
              <p>
                <a href={e.url} target="_blank" rel="noopener noreferrer">
                  Mer information
                </a>
              </p>
            )}
          </div>
        </details>
      ) : (
        <div className="ev-summary">{head}</div>
      )}
    </li>
  );
}

function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    // Multi-day all-day events show on each day they cover.
    let d = dayOf(e);
    const last = e.allDay && e.end ? e.end : d;
    for (let i = 0; d <= last && i < 31; i++, d = addDays(d, 1)) {
      const list = map.get(d) ?? [];
      list.push(e);
      map.set(d, list);
    }
  }
  return map;
}

function monthsBetween(fromDay: string, toDay: string, max = 18): string[] {
  const out: string[] = [];
  let [y, m] = fromDay.split("-").map(Number);
  const [ty, tm] = toDay.split("-").map(Number);
  while ((y < ty || (y === ty && m <= tm)) && out.length < max) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

function MonthGrid({ ym, byDay, colors, today }: { ym: string; byDay: Map<string, CalendarEvent[]>; colors: Map<string, string>; today: string }) {
  const first = `${ym}-01`;
  let start = addDays(first, -(isoWeekday(first) - 1));
  const weeks: string[][] = [];
  do {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
    start = addDays(start, 7);
  } while (start.slice(0, 7) === ym);
  return (
    <table className="cal-grid">
      <thead>
        <tr>
          <th className="cal-wk" aria-label="Vecka" />
          {WEEKDAYS.map((d) => (
            <th key={d} scope="col">
              {d}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]}>
            <th className="cal-wk" scope="row">
              {isoWeek(week[0])}
            </th>
            {week.map((day) => {
              const events = day.slice(0, 7) === ym ? (byDay.get(day) ?? []) : [];
              const cls = ["cal-day", day.slice(0, 7) !== ym && "off", day === today && "today", events.length === 0 && "empty", day < today && "past"]
                .filter(Boolean)
                .join(" ");
              return (
                <td key={day} className={cls}>
                  <div className="cal-date">
                    <span className="cal-date-long">{dayLabel(day)}</span>
                    <span className="cal-date-num">{Number(day.slice(8))}</span>
                  </div>
                  {events.length > 0 && (
                    <ul className="ev-list">
                      {events.map((e) => (
                        <EventItem key={`${e.uid}-${e.start}`} e={e} color={colors.get(e.feed) ?? "#999"} startOnly />
                      ))}
                    </ul>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Legend({ feeds, hidden, id }: { feeds: CalendarFeed[]; hidden: string[]; id: string }) {
  return (
    <fieldset className="cal-legend" data-cal-legend={id}>
      <legend className="sr-only">Visa kalendrar</legend>
      {feeds.map((f) => (
        <label key={f.key} className="cal-key" style={{ ["--ev-color" as string]: f.color }}>
          <input type="checkbox" value={f.key} defaultChecked={!hidden.includes(f.key)} /> {f.name}
        </label>
      ))}
    </fieldset>
  );
}

function eventJsonLd(events: CalendarEvent[], siteUrl: string) {
  return events.map((e) => ({
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    startDate: e.allDay ? e.start : `${e.start}:00`,
    ...(e.end ? { endDate: e.allDay ? e.end : `${e.end}:00` } : {}),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "Place", name: e.location || "Dansklubben Nackswinget", address: "Nacka, Sverige" },
    organizer: { "@type": "SportsClub", name: "Dansklubben Nackswinget", url: siteUrl },
  }));
}

/** Cached as a whole for 5 minutes (feeds update every 5 minutes; "today" moves). */
export async function Calendar({ section, feeds: allFeeds, siteUrl, id }: { section: CalendarSection; feeds: CalendarFeed[]; siteUrl: string; id: string }) {
  "use cache";
  cacheTag("calendar");
  cacheLife({ stale: 60, revalidate: 300, expire: 86_400 });
  const feeds = section.feeds.map((k) => allFeeds.find((f) => f.key === k)).filter((f): f is CalendarFeed => !!f);
  if (feeds.length === 0) return null;
  const colors = new Map(feeds.map((f) => [f.key, f.color]));
  const events = await loadEvents(feeds);
  const today = todayStockholm();
  const hideCss = feeds
    .map((f) => `[data-cal="${id}"][data-hide~="${f.key}"] .ev[data-feed="${f.key}"]{display:none}`)
    .join("");

  if (section.view === "list") {
    const upcoming = events.filter((e) => (e.end ?? e.start).slice(0, 10) >= today).slice(0, section.count ?? 6);
    return (
      <div className="cal cal-list" data-cal={id}>
        {section.title && <h2 className="cal-title">{section.title}</h2>}
        {upcoming.length === 0 ? (
          <p className="muted">Inga kommande aktiviteter.</p>
        ) : (
          [...groupByDay(upcoming)].map(([day, list]) => (
            <div key={day} className="ev-daygroup">
              <h3 className="ev-dayhead">{shortDay(day)}</h3>
              <ul className="ev-list">
                {list.map((e) => (
                  <li key={`${e.uid}-${e.start}`} className="ev ev-block" data-feed={e.feed} style={{ ["--ev-color" as string]: LIST_COLORS[e.feed] ?? colors.get(e.feed) }}>
                    <span className="ev-time">{timeRange(e)}</span>
                    <span className="ev-title">{e.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd(upcoming, siteUrl)) }} />
      </div>
    );
  }

  const byDay = groupByDay(events);

  if (section.view === "week") {
    const monday = addDays(today, -(isoWeekday(today) - 1));
    const days = Array.from({ length: 14 }, (_, i) => addDays(monday, i));
    return (
      <div className="cal cal-week" data-cal={id} data-hide={section.hiddenByDefault.join(" ")}>
        <style>{hideCss}</style>
        {[0, 7].map((offset) => (
          <section key={offset} className="cal-week-row">
            <h2>Vecka {isoWeek(days[offset])}</h2>
            <div className="cal-week-days">
              {days.slice(offset, offset + 7).map((day) => (
                <div key={day} className={day === today ? "cal-day today" : "cal-day"}>
                  <div className="cal-date">{dayLabel(day)}</div>
                  <ul className="ev-list">
                    {(byDay.get(day) ?? []).map((e) => (
                      <EventItem key={`${e.uid}-${e.start}`} e={e} color={colors.get(e.feed) ?? "#999"} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
        {section.showLegend && <Legend feeds={feeds} hidden={section.hiddenByDefault} id={id} />}
        <CalendarControls id={id} />
      </div>
    );
  }

  // Month view: every month from `pastDays` back until the last event (max 18).
  const lastDay = events.length ? (events[events.length - 1].end ?? events[events.length - 1].start).slice(0, 10) : today;
  const months = monthsBetween(addDays(today, -section.pastDays), lastDay > today ? lastDay : today);
  const current = today.slice(0, 7);
  return (
    <div className="cal cal-month" data-cal={id} data-hide={section.hiddenByDefault.join(" ")}>
      <style>{hideCss}</style>
      {section.showLegend && <Legend feeds={feeds} hidden={section.hiddenByDefault} id={id} />}
      {/* Month title and picker on one row; the title follows the picker. */}
      <div className="cal-toolbar">
        <p className="cal-month-title" aria-hidden="true" data-cal-title={id}>
          {monthLabel(current)}
        </p>
        <label className="cal-select">
          <span className="sr-only">Välj månad</span>
          <select data-cal-month={id} defaultValue={current}>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {months.map((m) => (
        <section key={m} className="cal-month-view" data-month={m} hidden={m !== current}>
          <h2 className="sr-only">{monthLabel(m)}</h2>
          <MonthGrid ym={m} byDay={byDay} colors={colors} today={today} />
        </section>
      ))}
      <CalendarControls id={id} />
    </div>
  );
}
