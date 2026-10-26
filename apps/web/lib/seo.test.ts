import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/lib/calendar/ics";
import type { Settings } from "@/lib/content/types";
import { canonicalPathname } from "@/lib/content/store";
import { articleJsonLd, buildMetadata, eventsJsonLd, jsonLd, siteJsonLd, stockholmOffset } from "./seo";

const settings: Settings = {
  siteName: "Dansklubben Nackswinget",
  tagline: "Danskurser och socialdans",
  siteUrl: "https://nackswinget.se",
  social: { facebook: "https://facebook.com/nackswinget" },
  footer: { address: "Ceylon", email: "info@nackswinget.se", links: [], badges: [] },
  calendarFeeds: [],
  orgNumber: "802405-6197",
};

const ev = (feed: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  uid: feed,
  feed,
  title: `Event ${feed}`,
  allDay: false,
  start: "2026-07-01T18:00",
  end: "2026-07-01T21:00",
  ...extra,
});

describe("jsonLd", () => {
  it("can't close the script tag", () => {
    expect(jsonLd({ name: "</script><script>alert(1)</script>" })).not.toContain("<");
  });
});

describe("stockholmOffset", () => {
  it("follows daylight saving time", () => {
    expect(stockholmOffset("2026-07-01T18:00")).toBe("+02:00");
    expect(stockholmOffset("2026-12-01T18:00")).toBe("+01:00");
  });
});

describe("eventsJsonLd", () => {
  it("only marks up public club events", () => {
    const out = eventsJsonLd(settings, [ev("event"), ev("kurs"), ev("fritraning"), ev("tavlingskalender")]);
    expect(out.map((e) => e.name)).toEqual(["Event event"]);
  });

  it("has the fields Google requires, with time zone and full address", () => {
    const [e] = eventsJsonLd(settings, [ev("event", { location: "Ceylon, Fredrik Jahns gränd 16" })]);
    expect(e.startDate).toBe("2026-07-01T18:00:00+02:00");
    expect(e.endDate).toBe("2026-07-01T21:00:00+02:00");
    expect(e.location).toMatchObject({ address: { streetAddress: "Fredrik Jahns gränd 16", postalCode: "131 36" } });
    expect(e.organizer).toMatchObject({ "@id": "https://nackswinget.se/#organization" });
  });

  it("keeps all-day dates as dates", () => {
    const [e] = eventsJsonLd(settings, [ev("event", { allDay: true, start: "2026-07-01", end: "2026-07-02" })]);
    expect(e.startDate).toBe("2026-07-01");
  });
});

describe("siteJsonLd", () => {
  it("describes the club and the website", () => {
    const graph = siteJsonLd(settings)["@graph"];
    expect(graph.map((n) => n["@type"])).toEqual(["SportsClub", "Place", "WebSite"]);
    expect(graph[0]).toMatchObject({ email: "info@nackswinget.se", address: { addressLocality: "Nacka" } });
  });
});

describe("articleJsonLd", () => {
  it("always has an image", () => {
    const a = articleJsonLd(settings, { id: "1", slug: "nyhet", title: "Nyhet", excerpt: "", categories: [], publishedAt: "2026-01-01T10:00:00Z", updatedAt: "2026-01-02T10:00:00Z" });
    expect(a.image[0]).toMatch(/^https:\/\/nackswinget\.se\/og\/\?title=Nyhet/);
    expect(a.dateModified).toBe("2026-01-02T10:00:00Z");
  });
});

describe("buildMetadata", () => {
  it("keeps the RSS alternate and drops the markdown twin when asked", () => {
    const m = buildMetadata({ settings, title: "Nyheter – sida 2", path: "/nyheter/sida/2/", markdown: false });
    expect(m.alternates?.canonical).toBe("https://nackswinget.se/nyheter/sida/2/");
    expect(m.alternates?.types).toEqual({ "application/rss+xml": "https://nackswinget.se/feed/" });
  });
});

describe("canonicalPathname", () => {
  it("folds case and slash variants and old WordPress pagination", () => {
    expect(canonicalPathname("/Kalender/")).toBe("/kalender/");
    expect(canonicalPathname("/kontakt//")).toBe("/kontakt/");
    expect(canonicalPathname("/nyheter/page/2/")).toBe("/nyheter/sida/2/");
    expect(canonicalPathname("/om-oss/%C3%A5rsm%C3%B6te/")).toBe("/om-oss/%C3%A5rsm%C3%B6te/");
    expect(canonicalPathname("/kurser/")).toBe("/kurser/");
  });
});
