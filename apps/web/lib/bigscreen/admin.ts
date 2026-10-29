import "server-only";
import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { type AdminUser, HttpError } from "@/lib/admin/auth";
import { audit } from "@/lib/admin/content";
import { getDb } from "@/lib/firebase/admin";
import { BIGSCREEN_COLLECTIONS, getPlaylist } from "./store";
import { type Block, blockSchema, type Playlist, playlistSchema, type Screen, screenSchema } from "./types";

// Admin side of Storbild: playlists (draft → publish, like pages) and screens.

const playlists = () => getDb().collection(BIGSCREEN_COLLECTIONS.playlists);
const screens = () => getDb().collection(BIGSCREEN_COLLECTIONS.screens);

const blocksSchema = z.array(blockSchema).max(200);

function parseBlocks(input: unknown): Block[] {
  const parsed = blocksSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, `Ogiltig spellista: ${parsed.error.issues[0]?.message ?? ""}`);
  const ids = new Set(parsed.data.map((b) => b.id));
  if (ids.size !== parsed.data.length) throw new HttpError(400, "Två block har samma id");
  return parsed.data;
}

export interface PlaylistRow {
  id: string;
  name: string;
  blocks: number;
  hasDraft: boolean;
  updatedAt?: string;
}

export async function listPlaylists(): Promise<PlaylistRow[]> {
  const snap = await playlists().get();
  return snap.docs
    .map((d) => playlistSchema.parse({ ...d.data(), id: d.id }))
    .map((p) => ({ id: p.id, name: p.name, blocks: p.blocks.length, hasDraft: !!p.draft, updatedAt: p.draftUpdatedAt ?? p.updatedAt }))
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

export async function requirePlaylist(id: string): Promise<Playlist> {
  const p = await getPlaylist(id);
  if (!p) throw new HttpError(404, "Spellistan finns inte");
  return p;
}

export async function createPlaylist(name: string, user: AdminUser): Promise<Playlist> {
  const ref = playlists().doc();
  const p: Playlist = { id: ref.id, name: name.trim() || "Ny spellista", blocks: [], version: 0, updatedAt: new Date().toISOString(), updatedBy: user.email };
  await ref.set(p);
  await audit(user, "create", `bigscreenPlaylists/${ref.id}`, p.name);
  return p;
}

export async function saveDraft(id: string, input: { blocks: unknown; name?: string }, user: AdminUser): Promise<Playlist> {
  await requirePlaylist(id);
  const blocks = parseBlocks(input.blocks);
  await playlists()
    .doc(id)
    .update({ draft: blocks, draftUpdatedAt: new Date().toISOString(), draftUpdatedBy: user.email, ...(input.name?.trim() ? { name: input.name.trim().slice(0, 80) } : {}) });
  return requirePlaylist(id);
}

/** The TVs pick a new version up within 30 s, after the block they are showing. */
export async function publishPlaylist(id: string, input: { blocks: unknown; name?: string }, user: AdminUser): Promise<Playlist> {
  const current = await requirePlaylist(id);
  const blocks = parseBlocks(input.blocks);
  await playlists()
    .doc(id)
    .update({
      blocks,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: user.email,
      ...(input.name?.trim() ? { name: input.name.trim().slice(0, 80) } : {}),
      draft: FieldValue.delete(),
      draftUpdatedAt: FieldValue.delete(),
      draftUpdatedBy: FieldValue.delete(),
    });
  await audit(user, "publish", `bigscreenPlaylists/${id}`, `${current.name}: ${blocks.length} block`);
  return requirePlaylist(id);
}

export async function discardDraft(id: string, user: AdminUser): Promise<Playlist> {
  await requirePlaylist(id);
  await playlists().doc(id).update({ draft: FieldValue.delete(), draftUpdatedAt: FieldValue.delete(), draftUpdatedBy: FieldValue.delete() });
  await audit(user, "discard", `bigscreenPlaylists/${id}`);
  return requirePlaylist(id);
}

export async function deletePlaylist(id: string, user: AdminUser) {
  const used = await screens().where("playlistId", "==", id).limit(1).get();
  if (!used.empty) throw new HttpError(409, "En skärm visar spellistan. Byt spellista på skärmen först.");
  await playlists().doc(id).delete();
  await audit(user, "delete", `bigscreenPlaylists/${id}`);
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

export const newKey = () => randomBytes(24).toString("base64url");

export async function listScreens(): Promise<Screen[]> {
  const snap = await screens().get();
  return snap.docs.map((d) => screenSchema.parse({ ...d.data(), id: d.id })).sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

const screenInput = z.object({
  name: z.string().trim().min(1).max(80),
  playlistId: z.string().min(1),
  quality: z.enum(["1080", "720"]),
  light: z.boolean(),
});

export async function createScreen(input: unknown, user: AdminUser): Promise<Screen> {
  const data = screenInput.safeParse(input);
  if (!data.success) throw new HttpError(400, "Ogiltig skärm");
  await requirePlaylist(data.data.playlistId);
  const ref = screens().doc();
  const screen = screenSchema.parse({ ...data.data, id: ref.id, key: newKey() });
  await ref.set(screen);
  await audit(user, "create", `bigscreens/${ref.id}`, screen.name);
  return screen;
}

export async function updateScreen(id: string, input: unknown, user: AdminUser): Promise<Screen> {
  const data = screenInput.partial().safeParse(input);
  if (!data.success) throw new HttpError(400, "Ogiltig skärm");
  if (data.data.playlistId) await requirePlaylist(data.data.playlistId);
  const ref = screens().doc(id);
  if (!(await ref.get()).exists) throw new HttpError(404, "Skärmen finns inte");
  await ref.update(data.data);
  await audit(user, "update", `bigscreens/${id}`);
  return screenSchema.parse({ ...(await ref.get()).data(), id });
}

/** "reload": the TV reloads within 30 s. "rotate": a new key; the old URL stops working. */
export async function screenAction(id: string, action: "reload" | "rotate", user: AdminUser): Promise<Screen> {
  const ref = screens().doc(id);
  if (!(await ref.get()).exists) throw new HttpError(404, "Skärmen finns inte");
  await ref.update(action === "reload" ? { reloadAt: new Date().toISOString() } : { key: newKey() });
  await audit(user, action, `bigscreens/${id}`);
  return screenSchema.parse({ ...(await ref.get()).data(), id });
}

export async function deleteScreen(id: string, user: AdminUser) {
  await screens().doc(id).delete();
  await audit(user, "delete", `bigscreens/${id}`);
}
