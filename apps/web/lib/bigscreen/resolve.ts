import type { MediaDoc } from "@/lib/admin/media";
import { todayStockholm } from "@/lib/calendar/ics";
import type { PostSummary } from "@/lib/content/types";
import { imageUrl, publicUrl } from "@/lib/media/urls";
import { type Block, DEFAULT_DURATION_SEC, type PlayerBlock, type Screen } from "./types";

/** Whether a block shows today (Stockholm date), ignoring media. */
export function isActive(block: Block, now = new Date()): boolean {
  if (block.disabled) return false;
  const today = todayStockholm(now);
  if (block.validFrom && today < block.validFrom) return false;
  if (block.validTo && today > block.validTo) return false;
  return true;
}

export function calendarFrameUrl(block: Extract<Block, { type: "calendar" }>): string {
  const q = new URLSearchParams({ view: block.view });
  if (block.feeds.length) q.set("feeds", block.feeds.join(","));
  return `/storbild/kalender/?${q}`;
}

export function agendaFrameUrl(block: Extract<Block, { type: "agenda" }>): string {
  const q = new URLSearchParams({ imorgon: String(block.tomorrowCount) });
  if (block.feeds.length) q.set("feeds", block.feeds.join(","));
  return `/storbild/dagens/?${q}`;
}

export const postFrameUrl = (slug: string) => `/storbild/nyhet/${encodeURIComponent(slug)}/`;
export const pageFrameUrl = (path: string) => `/storbild/sida/?path=${encodeURIComponent(path)}`;

export interface ResolveContext {
  media: Map<string, MediaDoc>;
  /** Published posts, newest first. */
  posts: PostSummary[];
  quality: Screen["quality"];
  now?: Date;
}

/**
 * Turns stored blocks into what the player plays: media URLs filled in,
 * "latest posts" expanded into one screen per post, and blocks that are
 * disabled, out of their date window or whose media/post is missing left out.
 */
export function resolveBlocks(blocks: Block[], ctx: ResolveContext): PlayerBlock[] {
  const out: PlayerBlock[] = [];
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
      case "calendar":
        out.push({ ...base, kind: "frame", src: calendarFrameUrl(block), durationSec: duration });
        break;
      case "agenda":
        out.push({ ...base, kind: "frame", src: agendaFrameUrl(block), durationSec: duration });
        break;
      case "latestPosts":
        for (const p of ctx.posts.slice(0, block.count)) {
          out.push({ ...base, id: `${block.id}:${p.id}`, kind: "frame", src: postFrameUrl(p.slug), durationSec: duration });
        }
        break;
      case "post": {
        const p = ctx.posts.find((x) => x.id === block.postId);
        if (p) out.push({ ...base, kind: "frame", src: postFrameUrl(p.slug), durationSec: duration });
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
