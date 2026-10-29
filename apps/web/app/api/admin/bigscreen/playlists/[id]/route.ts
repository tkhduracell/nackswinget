import { adminRoute } from "@/lib/admin/auth";
import { deletePlaylist, discardDraft, publishPlaylist, requirePlaylist, saveDraft } from "@/lib/bigscreen/admin";

type Ctx = { params: Promise<{ id: string }> };

export const GET = adminRoute<Ctx>("editor", async (_req, _user, { params }) => Response.json(await requirePlaylist((await params).id)));

/** Autosave: `{ blocks, name? }` becomes the draft. */
export const PUT = adminRoute<Ctx>("editor", async (req, user, { params }) => Response.json(await saveDraft((await params).id, await req.json(), user)));

/** Publish `{ blocks, name? }` to the screens. */
export const POST = adminRoute<Ctx>("editor", async (req, user, { params }) => Response.json(await publishPlaylist((await params).id, await req.json(), user)));

/** `?draft` discards the draft; without it the playlist is deleted (admins only). */
export const DELETE = adminRoute<Ctx>("editor", async (req, user, { params }) => {
  const { id } = await params;
  if (new URL(req.url).searchParams.has("draft")) return Response.json(await discardDraft(id, user));
  if (user.role !== "admin") return Response.json({ error: "Kräver administratörsbehörighet" }, { status: 403 });
  await deletePlaylist(id, user);
  return Response.json({ ok: true });
});
