import type { Metadata } from "next";
import { Calendar } from "@/components/calendar/Calendar";
import { getPage, getSite } from "@/lib/content/cached";

export const metadata: Metadata = {
  title: "Kalender för TV",
  robots: { index: false, follow: false },
  // The TV in the club room reloads every 5 minutes to pick up changes.
  other: { refresh: "300" },
};

const DEFAULT = {
  type: "calendar" as const,
  feeds: ["huvud", "kurs", "tavlingskalender", "event", "fritraning", "tavlingar"],
  hiddenByDefault: [],
  view: "week" as const,
  pastDays: 0,
  showLegend: true,
};

export default async function TvCalendar() {
  const [{ settings }, page] = await Promise.all([getSite(), getPage("kalender-for-tv")]);
  const section = page?.sections.find((s) => s.type === "calendar") ?? DEFAULT;
  return (
    <main className="tv">
      <Calendar section={{ ...section, view: "week" }} feeds={settings.calendarFeeds} siteUrl={settings.siteUrl} id="tv" />
    </main>
  );
}
