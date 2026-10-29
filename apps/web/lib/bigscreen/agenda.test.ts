import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/lib/calendar/ics";
import { buildAgenda } from "./agenda";

const ev = (title: string, start: string, end?: string, allDay = false): CalendarEvent => ({ uid: title, feed: "huvud", title, start, end, allDay });

// 18:30 on Thursday 29 October, Stockholm (UTC+1).
const NOW = new Date("2026-10-29T17:30:00Z");

const events = [
  ev("Förmiddagsbugg", "2026-10-29T10:00", "2026-10-29T11:30"),
  ev("Ungdom", "2026-10-29T16:45", "2026-10-29T18:00"),
  ev("Tävlingsträning", "2026-10-29T18:15", "2026-10-29T21:45"),
  ev("Kurs", "2026-10-29T19:00", "2026-10-29T20:15"),
  ev("Medlemsträning", "2026-10-29T21:00", "2026-10-29T22:15"),
  ev("Städdag", "2026-10-29", "2026-10-30", true),
  ev("Planering", "2026-10-30T11:00", "2026-10-30T12:00"),
  ev("Morgonfox", "2026-10-30T09:00", "2026-10-30T10:00"),
  ev("Kväll", "2026-10-30T19:00", "2026-10-30T20:00"),
  ev("Nästa vecka", "2026-11-02T18:00", "2026-11-02T19:00"),
];

describe("buildAgenda", () => {
  it("drops what has ended, marks what's on now and the one after", () => {
    const a = buildAgenda(events, NOW, 2);
    expect(a.today).toBe("2026-10-29");
    expect(a.rows.map((r) => `${r.event.title}:${r.status}`)).toEqual(["Ungdom:done", "Städdag:later", "Tävlingsträning:now", "Kurs:next", "Medlemsträning:later"]);
  });

  it("has no dimmed row before anything has ended", () => {
    expect(buildAgenda(events, new Date("2026-10-29T07:00:00Z"), 0).rows[0].status).not.toBe("done");
  });

  it("lists the first events of tomorrow in time order", () => {
    expect(buildAgenda(events, NOW, 2).next.map((e) => e.title)).toEqual(["Morgonfox", "Planering"]);
    expect(buildAgenda(events, NOW, 0).next).toEqual([]);
  });

  it("marks only one event as next, and several as now when they overlap", () => {
    const a = buildAgenda(events, new Date("2026-10-29T18:10:00Z"), 1); // 19:10
    expect(a.rows.filter((r) => r.status === "now").map((r) => r.event.title)).toEqual(["Tävlingsträning", "Kurs"]);
    expect(a.rows.filter((r) => r.status === "next").map((r) => r.event.title)).toEqual(["Medlemsträning"]);
  });

  it("keeps only the last ended event late in the evening, tomorrow still shows", () => {
    const a = buildAgenda(events.filter((e) => !e.allDay), new Date("2026-10-29T22:00:00Z"), 3); // 23:00
    expect(a.rows.map((r) => `${r.event.title}:${r.status}`)).toEqual(["Medlemsträning:done"]);
    expect(a.next).toHaveLength(3);
  });
});
