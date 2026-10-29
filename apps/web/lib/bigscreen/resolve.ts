import type { MediaDoc } from "@/lib/admin/media";
import { type CalendarEvent, todayStockholm } from "@/lib/calendar/ics";
import type { CalendarFeed, PostSummary } from "@/lib/content/types";
import { imageUrl, publicUrl } from "@/lib/media/urls";
import { buildAgenda } from "./agenda";
import { agendaHtml, postHtml, weekHtml } from "./render";
import { type Block, DEFAULT_DURATION_SEC, type PlayerBlock, type Screen } from "./types";

/** Whether a block shows today (Stockholm date), ignoring media. */
export function isActive(block: Block, now = new Date()): boolean {
  if (block.disabled) return false;
  const today = todayStockholm(now);
  if (block.validFrom && today < block.validFrom) return false;
  if (block.validTo && today > block.validTo) return false;
  return true;
}

export const pageFrameUrl = (path: string) => `/storbild/sida/?path=${encodeURIComponent(path)}`;

export interface ResolveContext {
  media: Map<string, MediaDoc>;
  /** Published posts, newest first. */
  posts: PostSummary[];
  quality: Screen["quality"];
  now?: Date;
  /** Every calendar feed and their events (calendar and agenda blocks). */
  feeds?: CalendarFeed[];
  events?: CalendarEvent[];
  /** Plain text of posts that have no excerpt, by post id. */
  postText?: Map<string, string>;
}

/** The feeds a calendar or agenda block shows: the picked ones, or all. */
function pickFeeds(picked: string[], ctx: ResolveContext) {
  const feeds = (ctx.feeds ?? []).filter((f) => !picked.length || picked.includes(f.key));
  const keys = new Set(feeds.map((f) => f.key));
  return { feeds, events: (ctx.events ?? []).filter((e) => keys.has(e.feed)) };
}

/**
 * Turns stored blocks into what the player plays: media URLs filled in,
 * posts, calendar and agenda rendered to markup, "latest posts" expanded
 * into one screen per post, and blocks that are
 * disabled, out of their date window or whose media/post is missing left out.
 */
export function resolveBlocks(blocks: Block[], ctx: ResolveContext): PlayerBlock[] {
  const out: PlayerBlock[] = [];
  const now = ctx.now ?? new Date();
  const post = (p: PostSummary) => ({ kind: "html" as const, src: `post:${p.id}`, html: postHtml(p, p.excerpt || (ctx.postText?.get(p.id) ?? "")) });
  for (const block of blocks) {
    if (!isActive(block, ctx.now)) continue;
    const base = { id: block.id, ...(block.caption ? { caption: block.caption } : {}) };
    const duration = block.durationSec ?? DEFAULT_DURATION_SEC;
    switch (block.type) {
      case "image": {
        const m = ctx.media.get(block.mediaId);
        if (!m || m.deletedAt || m.status !== "ready" || m.kind !== "image") break;
        // The original is full resolution; the largest WebP variant is only 1600 px wide.
        const src = (m.width ?? 0) > 1600 || !m.variants.length ? publicUrl(m.path) : imageUrl(m.path, m.variants);
        out.push({ ...base, kind: "image", src, fit: block.fit, ...(block.background ? { background: block.background } : {}), durationSec: duration });
        break;
      }
      case "video": {
        const m = ctx.media.get(block.mediaId);
        const r = m?.renditions;
        if (!m || m.deletedAt || m.status !== "ready" || m.kind !== "video" || !r) break;
        const src = ctx.quality === "720" || !r.src1080 ? r.src720 : r.src1080;
        out.push({
          ...base,
          kind: "video",
          src: publicUrl(src),
          ...(r.poster ? { poster: publicUrl(r.poster) } : {}),
          ...(block.durationSec ? { durationSec: block.durationSec } : {}),
        });
        break;
      }
      case "calendar": {
        const { feeds, events } = pickFeeds(block.feeds, ctx);
        out.push({ ...base, kind: "html", src: "calendar", html: weekHtml(events, feeds, todayStockholm(now)), durationSec: duration });
        break;
      }
      case "agenda": {
        const { events } = pickFeeds(block.feeds, ctx);
        out.push({ ...base, kind: "html", src: "agenda", html: agendaHtml(buildAgenda(events, now, block.tomorrowCount)), durationSec: duration });
        break;
      }
      case "latestPosts":
        for (const p of ctx.posts.slice(0, block.count)) out.push({ ...base, id: `${block.id}:${p.id}`, ...post(p), durationSec: duration });
        break;
      case "post": {
        const p = ctx.posts.find((x) => x.id === block.postId);
        if (p) out.push({ ...base, ...post(p), durationSec: duration });
        break;
      }
      case "page":
        out.push({ ...base, kind: "frame", src: pageFrameUrl(block.path), durationSec: duration });
        break;
      case "text":
        out.push({ ...base, kind: "text", src: "", title: block.title, ...(block.body ? { body: block.body } : {}), ...(block.background ? { background: block.background } : {}), durationSec: duration });
        break;
    }
  }
  return out;
}

/** Seconds a block takes on the timeline (editor). Videos without a set duration use the clip length. */
export function blockSeconds(block: Block, clipSec?: number): number {
  if (block.type === "video") return block.durationSec ?? clipSec ?? DEFAULT_DURATION_SEC;
  const d = block.durationSec ?? DEFAULT_DURATION_SEC;
  return block.type === "latestPosts" ? d * block.count : d;
}
