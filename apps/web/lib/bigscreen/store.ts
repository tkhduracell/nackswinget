import "server-only";
import { type MediaDoc, refreshMedia } from "@/lib/admin/media";
import { loadEvents } from "@/lib/calendar/fetch";
import { getPost, getSite, listAllPosts } from "@/lib/content/cached";
import { getDb } from "@/lib/firebase/admin";
import { plainText } from "./render";
import { resolveBlocks } from "./resolve";
import { type Block, blockSchema, type PlayerBlock, type PlayerPayload, type Playlist, playlistSchema, type Screen, screenSchema } from "./types";

export const BIGSCREEN_COLLECTIONS = { screens: "bigscreens", playlists: "bigscreenPlaylists" } as const;

export async function getScreenByKey(key: string): Promise<Screen | null> {
  const snap = await getDb().collection(BIGSCREEN_COLLECTIONS.screens).where("key", "==", key).limit(1).get();
  const doc = snap.docs[0];
  return doc ? screenSchema.parse({ ...doc.data(), id: doc.id }) : null;
}

/**
 * Reads a playlist, skipping blocks that don't parse (a block type this
 * version doesn't know, e.g. after a rollback) instead of failing the whole
 * playlist and leaving every screen without content.
 */
export async function getPlaylist(id: string): Promise<Playlist | null> {
  const snap = await getDb().collection(BIGSCREEN_COLLECTIONS.playlists).doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  const valid = (list: unknown) => (Array.isArray(list) ? list.flatMap((b) => validBlock(b, id)) : undefined);
  return playlistSchema.parse({ ...data, id: snap.id, blocks: valid(data.blocks) ?? [], draft: valid(data.draft) });
}

function validBlock(input: unknown, playlistId: string): Block[] {
  const parsed = blockSchema.safeParse(input);
  if (parsed.success) return [parsed.data];
  console.warn(`bigscreen playlist ${playlistId}: skipping block ${JSON.stringify((input as { id?: unknown })?.id)}: ${parsed.error.issues[0]?.message}`);
  return [];
}

export async function getMedia(ids: string[]): Promise<Map<string, MediaDoc>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const db = getDb();
  const snaps = await db.getAll(...unique.map((id) => db.collection("media").doc(id)));
  const docs = snaps.filter((s) => s.exists).map((s) => s.data() as MediaDoc);
  // A video only turns "ready" when someone asks the transcoder (otherwise just
  // Bilder & filer does). Ask here too, or a clip uploaded from the Storbild
  // editor stays "processing" and the screens skip it forever.
  const fresh = await Promise.all(docs.map((m) => (m.kind === "video" && m.status === "processing" && m.jobName ? refreshMedia(m.id).catch(() => m) : m)));
  return new Map(fresh.map((m) => [m.id, m]));
}

/** Blocks → what the player plays (the TV, and the admin preview of a draft). */
export async function resolveForPlayer(blocks: Block[], quality: Screen["quality"], now = new Date()): Promise<PlayerBlock[]> {
  const needsPosts = blocks.some((b) => b.type === "latestPosts" || b.type === "post");
  const needsEvents = blocks.some((b) => b.type === "calendar" || b.type === "agenda");
  const [media, posts, feeds] = await Promise.all([
    getMedia(blocks.flatMap((b) => ("mediaId" in b ? [b.mediaId] : []))),
    needsPosts ? listAllPosts() : [],
    needsEvents ? getSite().then((s) => s.settings.calendarFeeds) : [],
  ]);
  const shown = new Set(blocks.flatMap((b) => (b.type === "post" ? [b.postId] : b.type === "latestPosts" ? posts.slice(0, b.count).map((p) => p.id) : [])));
  const [events, postText] = await Promise.all([needsEvents ? loadEvents(feeds) : [], textOf(posts.filter((p) => shown.has(p.id) && !p.excerpt))]);
  return resolveBlocks(blocks, { media, posts, quality, now, feeds, events, postText });
}

/** The body text of posts that have no excerpt. */
async function textOf(posts: { id: string; slug: string }[]): Promise<Map<string, string>> {
  const full = await Promise.all(posts.map((p) => getPost(p.slug)));
  return new Map(posts.map((p, i) => [p.id, plainText(full[i]?.body)]));
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
