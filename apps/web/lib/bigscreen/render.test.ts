import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/lib/calendar/ics";
import type { RichDoc } from "@/lib/content/types";
import { buildAgenda } from "./agenda";
import { agendaHtml, esc, plainText, postHtml, weekHtml } from "./render";

const ev = (title: string, start: string, end?: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({ uid: title, feed: "huvud", title, start, end, allDay: false, ...extra });
const feeds = [{ key: "huvud", name: "Huvud", color: "#800080", url: "https://example.test/h.ics" }];

describe("render", () => {
  it("escapes everything that comes from content", () => {
    expect(esc(`<img src=x onerror="a">&'`)).toBe("&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;");
    expect(postHtml({ title: "<b>Hej</b>" }, "")).toContain("<h1>&lt;b&gt;Hej&lt;/b&gt;</h1>");
    expect(weekHtml([ev("<script>", "2026-10-29T18:00")], feeds, "2026-10-29")).not.toContain("<script>");
  });

  it("draws a post with its picture, or text only", () => {
    expect(postHtml({ title: "A", image: { src: "web/media/x/a.jpg", variants: [960], alt: "" } as never }, "B")).toMatch(/class="bs-post"><img class="bs-post-image" src="[^"]+960\.webp"/);
    expect(postHtml({ title: "A" }, "")).toContain('class="bs-post no-image"');
  });

  it("takes a post's paragraphs as plain text", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Ett" }] }, { type: "image", attrs: {} }, { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Två" }] }] } as RichDoc;
    expect(plainText(doc)).toBe("Ett\n\nTvå");
  });

  it("lays out this week and next, today marked, the clock left to the player", () => {
    const html = weekHtml([ev("Bugg", "2026-10-29T18:00", "2026-10-29T19:00"), ev("Läger", "2026-11-07", "2026-11-08", { allDay: true })], feeds, "2026-10-29");
    expect(html).toContain("Vecka 44");
    expect(html).toContain("Vecka 45");
    expect(html).toContain('class="bs-cal-day today"><p class="bs-cal-date">tor 29 oktober');
    expect(html).toContain("18:00–19:00</span> Bugg");
    // An all-day event covering two days shows on both.
    expect(html.match(/Läger/g)).toHaveLength(2);
    const agenda = agendaHtml(buildAgenda([ev("Bugg", "2026-10-29T18:00", "2026-10-29T19:00")], new Date("2026-10-29T17:30:00Z"), 0));
    expect(agenda).toContain("data-bs-clock></span>");
    expect(agenda).toContain('class="bs-ag-row is-now"');
  });
});
