import { z } from "zod";

// Storbild (docs/bigscreen-plan.md). Firestore:
//   bigscreenPlaylists/{id}   Playlist
//   bigscreens/{id}           Screen (the player finds it by its `key`)

const blockBase = {
  id: z.string().min(1),
  /** Seconds on screen. Videos: optional, they play to the end (or stop here if shorter). */
  durationSec: z.number().positive().max(3600).optional(),
  /** Text overlay along the bottom edge. */
  caption: z.string().max(200).optional(),
  /** YYYY-MM-DD, Stockholm time; the block is skipped outside [validFrom, validTo]. */
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  disabled: z.boolean().optional(),
};

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ ...blockBase, type: z.literal("image"), mediaId: z.string().min(1), fit: z.enum(["cover", "contain"]).default("cover") }),
  // Always muted: the TVs never play sound.
  z.object({ ...blockBase, type: z.literal("video"), mediaId: z.string().min(1) }),
  z.object({ ...blockBase, type: z.literal("calendar"), view: z.enum(["week"]).default("week"), feeds: z.array(z.string()).default([]) }),
  // "Senaste N nyheterna": the N newest published posts, durationSec each (plan B11).
  z.object({ ...blockBase, type: z.literal("latestPosts"), count: z.number().int().min(1).max(10).default(3) }),
  // A site page in TV layout. The path is stored (not the id) so the player needs no lookup.
  z.object({ ...blockBase, type: z.literal("page"), path: z.string(), title: z.string().optional() }),
  z.object({ ...blockBase, type: z.literal("post"), postId: z.string().min(1) }),
  z.object({ ...blockBase, type: z.literal("text"), title: z.string().max(120), body: z.string().max(600).optional(), background: z.string().regex(/^#[0-9a-f]{6}$/i).optional() }),
]);
export type Block = z.infer<typeof blockSchema>;

export const playlistSchema = z.object({
  id: z.string(),
  name: z.string(),
  blocks: z.array(blockSchema).default([]),
  version: z.number().int().nonnegative().default(0),
  updatedAt: z.string().optional(),
  updatedBy: z.string().optional(),
  /** Unpublished edits from the timeline editor (autosaved). */
  draft: z.array(blockSchema).optional(),
  draftUpdatedAt: z.string().optional(),
  draftUpdatedBy: z.string().optional(),
});
export type Playlist = z.infer<typeof playlistSchema>;

export const screenSchema = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string().min(16),
  playlistId: z.string(),
  // The Pi Zero 2 W players have 512 MB RAM: 720p and light mode by default (plan B12).
  quality: z.enum(["1080", "720"]).default("720"),
  /** Never two videos loaded at once: no video preload during a video, videos fade through black. */
  light: z.boolean().default(true),
  /** Bumped from the admin; the player reloads itself when it changes. */
  reloadAt: z.string().optional(),
  lastSeenAt: z.string().optional(),
  nowPlaying: z.string().optional(),
  userAgent: z.string().optional(),
  resolution: z.string().optional(),
  errors: z.array(z.string()).optional(),
});
export type Screen = z.infer<typeof screenSchema>;

export const DEFAULT_DURATION_SEC = 10;

/** What the player gets: URLs resolved, skipped blocks removed. */
export interface PlayerBlock {
  id: string;
  kind: "image" | "video" | "frame" | "text";
  src: string;
  /** Undefined for a video that plays to its end. */
  durationSec?: number;
  fit?: "cover" | "contain";
  poster?: string;
  caption?: string;
  /** kind "text": drawn by the player itself, no page load. */
  title?: string;
  body?: string;
  background?: string;
}

export interface PlayerPayload {
  screen: { name: string; light: boolean; reloadAt?: string };
  blocks: PlayerBlock[];
}

export const heartbeatSchema = z.object({
  nowPlaying: z.string().max(100).optional(),
  resolution: z.string().max(40).optional(),
  errors: z.array(z.string().max(300)).max(20).optional(),
});
