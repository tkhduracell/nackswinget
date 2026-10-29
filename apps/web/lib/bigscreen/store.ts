import "server-only";
import type { MediaDoc } from "@/lib/admin/media";
import { listAllPosts } from "@/lib/content/cached";
import { getDb } from "@/lib/firebase/admin";
import { resolveBlocks } from "./resolve";
import { type Block, type PlayerBlock, type PlayerPayload, type Playlist, playlistSchema, type Screen, screenSchema } from "./types";

export const BIGSCREEN_COLLECTIONS = { screens: "bigscreens", playlists: "bigscreenPlaylists" } as const;

export async function getScreenByKey(key: string): Promise<Screen | null> {
  const snap = await getDb().collection(BIGSCREEN_COLLECTIONS.screens).where("key", "==", key).limit(1).get();
  const doc = snap.docs[0];
  return doc ? screenSchema.parse({ ...doc.data(), id: doc.id }) : null;
}

export async function getPlaylist(id: string): Promise<Playlist | null> {
  const snap = await getDb().collection(BIGSCREEN_COLLECTIONS.playlists).doc(id).get();
  return snap.exists ? playlistSchema.parse({ ...snap.data(), id: snap.id }) : null;
}

export async function getMedia(ids: string[]): Promise<Map<string, MediaDoc>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const db = getDb();
  const snaps = await db.getAll(...unique.map((id) => db.collection("media").doc(id)));
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, s.data() as MediaDoc]));
}

/** Blocks → what the player plays (the TV, and the admin preview of a draft). */
export async function resolveForPlayer(blocks: Block[], quality: Screen["quality"], now = new Date()): Promise<PlayerBlock[]> {
  const needsPosts = blocks.some((b) => b.type === "latestPosts" || b.type === "post");
  const [media, posts] = await Promise.all([getMedia(blocks.flatMap((b) => ("mediaId" in b ? [b.mediaId] : []))), needsPosts ? listAllPosts() : []]);
  return resolveBlocks(blocks, { media, posts, quality, now });
}

/** Everything the player needs for one screen, or null for an unknown key. */
export async function playerPayload(key: string, now = new Date()): Promise<PlayerPayload | null> {
  const screen = await getScreenByKey(key);
  if (!screen) return null;
  const playlist = await getPlaylist(screen.playlistId);
  return {
    screen: { name: screen.name, light: screen.light, ...(screen.reloadAt ? { reloadAt: screen.reloadAt } : {}) },
    blocks: await resolveForPlayer(playlist?.blocks ?? [], screen.quality, now),
  };
}

export async function recordHeartbeat(screen: Screen, beat: { nowPlaying?: string; resolution?: string; errors?: string[]; userAgent?: string }) {
  await getDb()
    .collection(BIGSCREEN_COLLECTIONS.screens)
    .doc(screen.id)
    .update({ ...beat, lastSeenAt: new Date().toISOString() });
}
