import { describe, expect, it } from "vitest";
import type { MediaDoc } from "@/lib/admin/media";
import { PUBLIC_BASE } from "@/lib/media/urls";
import type { PostSummary } from "@/lib/content/types";
import type { CalendarEvent } from "@/lib/calendar/ics";
import { blockSeconds, isActive, resolveBlocks } from "./resolve";
import { type Block, blockSchema } from "./types";

const media = (doc: Partial<MediaDoc> & Pick<MediaDoc, "id" | "kind" | "path">): MediaDoc => ({
  name: doc.path,
  contentType: "",
  size: 1,
  alt: "",
  variants: [],
  status: "ready",
  createdAt: "",
  createdBy: "",
  ...doc,
});

const library = new Map<string, MediaDoc>([
  ["img", media({ id: "img", kind: "image", path: "web/media/img/a.png", width: 1920, variants: [480, 960, 1600] })],
  ["small", media({ id: "small", kind: "image", path: "web/media/small/b.png", width: 1200, variants: [480, 960, 1200] })],
  ["vid", media({ id: "vid", kind: "video", path: "web/media/vid/v.mp4", renditions: { src720: "web/media/vid/out/720.mp4", src1080: "web/media/vid/out/1080.mp4", poster: "web/media/vid/out/poster.jpeg" } })],
  ["busy", media({ id: "busy", kind: "video", path: "web/media/busy/v.mp4", status: "processing" })],
  ["gone", media({ id: "gone", kind: "image", path: "web/media/gone/c.png", deletedAt: "2026-10-01T00:00:00Z" })],
]);

const NOW = new Date("2026-10-29T10:00:00+01:00");
const post = (id: string, slug: string): PostSummary => ({ id, slug, title: id, excerpt: "", categories: [], publishedAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" });
const POSTS = [post("p3", "tredje"), post("p2", "andra"), post("p1", "forsta")];
const parse = (b: unknown) => blockSchema.parse(b);

describe("isActive", () => {
  const block = (extra: object) => parse({ id: "b", type: "image", mediaId: "img", ...extra });
  it("respects the date window in Stockholm time, inclusive", () => {
    expect(isActive(block({ validFrom: "2026-10-29", validTo: "2026-10-29" }), NOW)).toBe(true);
    expect(isActive(block({ validFrom: "2026-10-30" }), NOW)).toBe(false);
    expect(isActive(block({ validTo: "2026-10-28" }), NOW)).toBe(false);
    // 23:30 UTC on the 28th is already the 29th in Stockholm.
    expect(isActive(block({ validFrom: "2026-10-29" }), new Date("2026-10-28T23:30:00Z"))).toBe(true);
  });
  it("skips disabled blocks", () => {
    expect(isActive(block({ disabled: true }), NOW)).toBe(false);
  });
});

describe("resolveBlocks", () => {
  const blocks: Block[] = [
    parse({ id: "1", type: "video", mediaId: "vid" }),
    parse({ id: "2", type: "image", mediaId: "img", durationSec: 5, caption: "Hej" }),
    parse({ id: "3", type: "image", mediaId: "small" }),
    parse({ id: "4", type: "calendar", feeds: ["huvud", "kurs"] }),
    parse({ id: "5", type: "video", mediaId: "busy" }),
    parse({ id: "6", type: "image", mediaId: "gone" }),
    parse({ id: "7", type: "image", mediaId: "missing" }),
  ];

  it("fills in URLs and defaults, and drops blocks whose media isn't ready", () => {
    expect(resolveBlocks(blocks, { media: library, posts: POSTS, quality: "1080", now: NOW })).toEqual([
      { id: "1", kind: "video", src: `${PUBLIC_BASE}/web/media/vid/out/1080.mp4`, poster: `${PUBLIC_BASE}/web/media/vid/out/poster.jpeg` },
      { id: "2", kind: "image", src: `${PUBLIC_BASE}/web/media/img/a.png`, fit: "cover", durationSec: 5, caption: "Hej" },
      { id: "3", kind: "image", src: `${PUBLIC_BASE}/web/variants/media/small/b/1200.webp`, fit: "cover", durationSec: 10 },
      { id: "4", kind: "html", src: "calendar", html: expect.stringContaining("Vecka 44"), durationSec: 10 },
    ]);
  });

  it("uses the 720p rendition for screens set to 720", () => {
    expect(resolveBlocks(blocks.slice(0, 1), { media: library, posts: POSTS, quality: "720", now: NOW })[0].src).toBe(`${PUBLIC_BASE}/web/media/vid/out/720.mp4`);
  });

  it("keeps a video's duration only when one is set", () => {
    const [v] = resolveBlocks([parse({ id: "1", type: "video", mediaId: "vid", durationSec: 8 })], { media: library, posts: POSTS, quality: "1080", now: NOW });
    expect(v.durationSec).toBe(8);
  });
});

describe("calendar and agenda", () => {
  const feeds = [
    { key: "huvud", name: "Huvud", color: "#800080", url: "https://example.test/h.ics" },
    { key: "kurs", name: "Kurs", color: "#a35f00", url: "https://example.test/k.ics" },
  ];
  const ev = (title: string, feed: string, start: string, end: string): CalendarEvent => ({ uid: title, feed, title, start, end, allDay: false });
  const events = [ev("Bugg", "huvud", "2026-10-29T18:00", "2026-10-29T19:00"), ev("Fox", "kurs", "2026-10-29T19:00", "2026-10-29T20:00")];
  const ctx = { media: library, posts: [], quality: "720" as const, now: NOW, feeds, events };

  it("shows only the picked feeds, or all when none are picked", () => {
    const [only] = resolveBlocks([parse({ id: "c", type: "calendar", feeds: ["kurs"] })], ctx);
    expect(only.html).toContain("Fox");
    expect(only.html).not.toContain("Bugg");
    const [all] = resolveBlocks([parse({ id: "a", type: "agenda" })], ctx);
    expect(all).toMatchObject({ kind: "html", src: "agenda" });
    expect(all.html).toContain("Bugg");
    expect(all.html).toContain("Fox");
  });
});

describe("content blocks", () => {
  const ctx = { media: library, posts: POSTS, quality: "720" as const, now: NOW };
  it("expands latest posts into one screen per post, newest first", () => {
    const out = resolveBlocks([parse({ id: "n", type: "latestPosts", count: 2, durationSec: 8 })], ctx);
    expect(out.map(({ id, kind, src, durationSec }) => ({ id, kind, src, durationSec }))).toEqual([
      { id: "n:p3", kind: "html", src: "post:p3", durationSec: 8 },
      { id: "n:p2", kind: "html", src: "post:p2", durationSec: 8 },
    ]);
    expect(out[0].html).toContain("<h1>p3</h1>");
  });
  it("shows fewer screens when there are fewer posts, none without posts", () => {
    expect(resolveBlocks([parse({ id: "n", type: "latestPosts", count: 5 })], ctx)).toHaveLength(3);
    expect(resolveBlocks([parse({ id: "n", type: "latestPosts", count: 5 })], { ...ctx, posts: [] })).toEqual([]);
  });
  it("resolves a pinned post by id and drops one that is gone", () => {
    expect(resolveBlocks([parse({ id: "a", type: "post", postId: "p1" }), parse({ id: "b", type: "post", postId: "nope" })], ctx)).toMatchObject([{ id: "a", kind: "html", src: "post:p1", durationSec: 10 }]);
  });
  it("uses the post's body text when it has no excerpt", () => {
    const [p] = resolveBlocks([parse({ id: "a", type: "post", postId: "p1" })], { ...ctx, postText: new Map([["p1", "Välkomna <alla>"]]) });
    expect(p.html).toContain("Välkomna &lt;alla&gt;");
  });
  it("links pages by path and draws text itself", () => {
    expect(resolveBlocks([parse({ id: "s", type: "page", path: "om-oss/styrelse" }), parse({ id: "t", type: "text", title: "Hej", background: "#e0053d" })], ctx)).toEqual([
      { id: "s", kind: "frame", src: "/storbild/sida/?path=om-oss%2Fstyrelse", durationSec: 10 },
      { id: "t", kind: "text", src: "", title: "Hej", background: "#e0053d", durationSec: 10 },
    ]);
  });
});

describe("blockSeconds", () => {
  it("uses the clip length for videos without a duration, N × duration for latest posts", () => {
    expect(blockSeconds(parse({ id: "v", type: "video", mediaId: "vid" }), 23)).toBe(23);
    expect(blockSeconds(parse({ id: "v", type: "video", mediaId: "vid", durationSec: 8 }), 23)).toBe(8);
    expect(blockSeconds(parse({ id: "n", type: "latestPosts", count: 3, durationSec: 8 }))).toBe(24);
    expect(blockSeconds(parse({ id: "c", type: "calendar" }))).toBe(10);
  });
});
