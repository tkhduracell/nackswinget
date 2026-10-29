import type { Metadata } from "next";
import { Suspense } from "react";
import { Calendar } from "@/components/calendar/Calendar";
import { getSite } from "@/lib/content/cached";

export const metadata: Metadata = {
  title: "Kalender för storbild",
  robots: { index: false, follow: false },
};

// The calendar block: the week view at TV size, loaded in an iframe by the
// Storbild player. ?feeds=a,b limits the feeds (default: all).
export default function StorbildKalender({ searchParams }: PageProps<"/storbild/kalender">) {
  return (
    <main className="tv bs-calendar">
      <Suspense>
        <WeekCalendar searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function WeekCalendar({ searchParams }: { searchParams: PageProps<"/storbild/kalender">["searchParams"] }) {
  const [{ feeds: picked }, { settings }] = await Promise.all([searchParams, getSite()]);
  const wanted = typeof picked === "string" ? picked.split(",").filter(Boolean) : [];
  const feeds = wanted.length ? wanted : settings.calendarFeeds.map((f) => f.key);
  return (
    <Calendar
      section={{ type: "calendar", feeds, hiddenByDefault: [], view: "week", pastDays: 0, showLegend: true }}
      feeds={settings.calendarFeeds}
      site={{ siteUrl: settings.siteUrl, siteName: settings.siteName }}
      id="storbild"
    />
  );
}
