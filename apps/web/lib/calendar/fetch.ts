import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { CalendarFeed } from "@/lib/content/types";
import { type CalendarEvent, mergeEvents, parseIcs } from "./ics";

/**
 * Fetches and parses one feed. Cached for 5 minutes (the feeds themselves are
 * rewritten every 5 minutes by functions/calendars-api).
 */
async function loadFeed(feed: CalendarFeed): Promise<CalendarEvent[]> {
  "use cache";
  cacheTag("calendar", `calendar:${feed.key}`);
  cacheLife({ stale: 60, revalidate: 300, expire: 86_400 });
  try {
    const res = await fetch(feed.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status}`);
    return parseIcs(await res.text(), feed.key);
  } catch (e) {
    console.error(`calendar feed ${feed.key} failed: ${(e as Error).message}`);
    // Throwing keeps the previous cached value (stale-while-revalidate) when there is one.
    throw e;
  }
}

export async function loadEvents(feeds: CalendarFeed[]): Promise<CalendarEvent[]> {
  const lists = await Promise.all(feeds.map((f) => loadFeed(f).catch(() => [] as CalendarEvent[])));
  return mergeEvents(lists);
}
