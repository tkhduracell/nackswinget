import type { CalendarFeed, PostSummary, RichDoc, RichNode } from "@/lib/content/types";
import { addDays, type CalendarEvent, dayOf, isoWeek, isoWeekday, timeOf } from "@/lib/calendar/ics";
import { imageUrl } from "@/lib/media/urls";
import { type Agenda, type AgendaStatus } from "./agenda";

// Server-rendered markup for the blocks the player draws itself (kind "html"):
// news posts, the week calendar and "Dagens schema". Plain strings, so the TV
// needs no React and no extra page per block (a Pi Zero 2 W has 512 MB).
// Styles: public/storbild/tv.css.

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

const TZ = "Europe/Stockholm";
const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const WEEKDAYS_SHORT = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];
const longDay = (day: string) => new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date(`${day}T12:00:00Z`));

/** A post's body as plain paragraphs, for posts without an excerpt. */
export function plainText(doc: RichDoc | undefined, max = 600): string {
  const parts: string[] = [];
  const text = (n: RichNode): string => (n.type === "text" ? n.text : n.type === "hardBreak" ? " " : "content" in n && n.content ? n.content.map(text).join("") : "");
  for (const n of doc?.content ?? []) {
    if (n.type !== "paragraph" && n.type !== "heading") continue;
    const t = text(n).trim();
    if (t) parts.push(t);
    if (parts.join("\n\n").length >= max) break;
  }
  return parts.join("\n\n").slice(0, max);
}

/** One news post: the featured image on the left, title and text on the right. */
export function postHtml(post: Pick<PostSummary, "title" | "image">, text: string): string {
  const img = post.image ? `<img class="bs-post-image" src="${esc(imageUrl(post.image.src, post.image.variants))}" alt="">` : "";
  return (
    `<article class="bs-post${post.image ? "" : " no-image"}">${img}<div class="bs-post-text">` +
    `<p class="bs-kicker">Nyheter från Nackswinget</p><h1>${esc(post.title)}</h1>` +
    (text ? `<p class="bs-excerpt">${esc(text)}</p>` : "") +
    `</div></article>`
  );
}

const STATUS_LABEL: Record<AgendaStatus, string | null> = { done: null, now: "Pågår nu", next: "Härnäst", later: null };

function agendaTime(e: CalendarEvent): string {
  if (e.allDay) return "Heldag";
  const end = timeOf(e.end);
  return end ? `${timeOf(e.start)}–${end}` : (timeOf(e.start) ?? "");
}

function agendaRow(e: CalendarEvent, status: AgendaStatus | "tomorrow", i: number): string {
  const label = status === "tomorrow" ? null : STATUS_LABEL[status];
  return (
    `<li class="bs-ag-row is-${status}" style="--i:${i}"><span class="bs-ag-time">${esc(agendaTime(e))}</span>` +
    `<span class="bs-ag-title">${esc(e.title)}${e.location ? `<span class="bs-ag-where"> · ${esc(e.location)}</span>` : ""}</span>` +
    (label ? `<span class="bs-ag-badge">${label}</span>` : "") +
    `</li>`
  );
}

/**
 * "Dagens schema": today's remaining schedule as an old-style TV guide, then
 * the first events of tomorrow. The clock is filled in by the player
 * (data-bs-clock), so the markup only changes when an event starts or ends.
 */
export function agendaHtml({ today, tomorrow, rows, next }: Agenda): string {
  const head =
    `<header class="bs-ag-head"><div><p class="bs-ag-kicker">Dansklubben Nackswinget</p><h1>Dagens schema</h1></div>` +
    `<div class="bs-ag-clock"><span class="bs-ag-hhmm" data-bs-clock></span><span class="bs-ag-date">${esc(longDay(today))}</span></div></header>`;
  const list = rows.length ? `<ul class="bs-ag-list bs-ag-today">${rows.map((r, i) => agendaRow(r.event, r.status, i)).join("")}</ul>` : "";
  const empty = rows.some((r) => r.status !== "done") ? "" : `<p class="bs-ag-empty">Inga fler aktiviteter idag</p>`;
  const later = next.length
    ? `<section class="bs-ag-tomorrow" style="--i:${rows.length}"><h2>I morgon, ${esc(longDay(tomorrow))}</h2><ul class="bs-ag-list">${next.map((e, i) => agendaRow(e, "tomorrow", rows.length + 1 + i)).join("")}</ul></section>`
    : "";
  return `<div class="bs-ag">${head}${list}${empty}${later}</div>`;
}

function weekTime(e: CalendarEvent): string {
  if (e.allDay) return "Heldag";
  const s = timeOf(e.start);
  const end = timeOf(e.end);
  return end && e.end?.slice(0, 10) === dayOf(e) ? `${s}–${end}` : (s ?? "");
}

/** This week and next, Monday to Sunday, every event in its feed's colour. */
export function weekHtml(events: CalendarEvent[], feeds: CalendarFeed[], today: string): string {
  const colors = new Map(feeds.map((f) => [f.key, f.color]));
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    // Multi-day all-day events show on each day they cover.
    let d = dayOf(e);
    const last = e.allDay && e.end ? e.end : d;
    for (let i = 0; d <= last && i < 14; i++, d = addDays(d, 1)) byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }
  const monday = addDays(today, -(isoWeekday(today) - 1));
  const weeks = [0, 7].map((offset) => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, offset + i)).map((day) => {
      const [, m, d] = day.split("-").map(Number);
      const items = (byDay.get(day) ?? [])
        .map((e) => `<li class="bs-cal-ev" style="--ev-color:${esc(colors.get(e.feed) ?? "#999")}"><span class="bs-cal-time">${esc(weekTime(e))}</span> ${esc(e.title)}</li>`)
        .join("");
      return `<div class="bs-cal-day${day === today ? " today" : ""}${day < today ? " past" : ""}"><p class="bs-cal-date">${WEEKDAYS_SHORT[isoWeekday(day) - 1]} ${d} ${MONTHS[m - 1]}</p><ul>${items}</ul></div>`;
    });
    return `<section class="bs-cal-week"><h2>Vecka ${isoWeek(addDays(monday, offset))}</h2><div class="bs-cal-days">${days.join("")}</div></section>`;
  });
  return `<div class="bs-cal"><header class="bs-cal-head"><p class="bs-ag-kicker">Dansklubben Nackswinget</p><h1>Kalender</h1></header>${weeks.join("")}</div>`;
}
