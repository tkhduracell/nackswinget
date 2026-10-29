import { describe, expect, it } from "vitest";
import { addDays, isoWeek, isoWeekday, mergeEvents, parseIcs, toStockholm } from "./ics";

const FEED = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:1",
  "DTSTART:20261021T164500",
  "DTEND:20261021T180000",
  "SUMMARY:Medlemstr\\, äning",
  "LOCATION:Ceylon",
  "DESCRIPTION:Rad ett\\nRad tv",
  " å",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:2",
  "DTSTART;VALUE=DATE:20261031",
  "DTEND;VALUE=DATE:20261102",
  "SUMMARY:Tävling",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:3",
  "DTSTART:20260101T120000Z",
  "SUMMARY:UTC",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("parseIcs", () => {
  const events = parseIcs(FEED, "fritraning");

  it("reads floating local times as Stockholm wall time", () => {
    expect(events[0]).toMatchObject({ uid: "1", feed: "fritraning", start: "2026-10-21T16:45", end: "2026-10-21T18:00", allDay: false, location: "Ceylon" });
  });

  it("unescapes text and unfolds continuation lines", () => {
    expect(events[0].title).toBe("Medlemstr, äning");
    expect(events[0].description).toBe("Rad ett\nRad två");
  });

  it("decodes HTML entities in text", () => {
    const ics = ["BEGIN:VEVENT", "UID:x", "DTSTART:20261001T164500", "SUMMARY:Sluten tr&auml;ningsgrupp&nbsp;&amp; &#229;r&nbsp;", "END:VEVENT"].join("\r\n");
    expect(parseIcs(ics, "f")[0].title).toBe("Sluten träningsgrupp & år");
  });

  it("makes all-day DTEND inclusive", () => {
    expect(events[1]).toMatchObject({ allDay: true, start: "2026-10-31", end: "2026-11-01" });
  });

  it("converts UTC times to Stockholm", () => {
    expect(events[2].start).toBe("2026-01-01T13:00");
  });
});

describe("date helpers", () => {
  it("handles DST in toStockholm", () => {
    expect(toStockholm(new Date("2026-07-01T10:00:00Z"))).toBe("2026-07-01T12:00");
  });
  it("computes ISO weekday and week number", () => {
    expect(isoWeekday("2026-10-25")).toBe(7);
    expect(isoWeek("2026-10-21")).toBe(43);
    expect(isoWeek("2027-01-01")).toBe(53);
  });
  it("adds days across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});

describe("mergeEvents", () => {
  it("sorts and dedupes by uid+start", () => {
    const a = parseIcs(FEED, "a");
    const merged = mergeEvents([a, a]);
    expect(merged).toHaveLength(3);
    expect(merged.map((e) => e.uid)).toEqual(["3", "1", "2"]);
  });
});
