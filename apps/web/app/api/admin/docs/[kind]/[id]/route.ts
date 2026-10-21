import { adminRoute } from "@/lib/admin/auth";
import { discardDraft, getDoc, kindOf, publish, saveDraft, trashDoc } from "@/lib/admin/content";

type Ctx = { params: Promise<{ kind: string; id: string }> };

/** Published version + draft (if any). */
export const GET = adminRoute<Ctx>("editor", async (_req, _user, { params }) => {
  const { kind, id } = await params;
  return Response.json(await getDoc(kindOf(kind), id));
});

/** Autosave the draft. */
export const PUT = adminRoute<Ctx>("editor", async (req, user, { params }) => {
  const { kind, id } = await params;
  await saveDraft(kindOf(kind), id, await req.json(), user);
  return Response.json({ ok: true });
});

/** Publish. */
export const POST = adminRoute<Ctx>("editor", async (req, user, { params }) => {
  const { kind, id } = await params;
  return Response.json(await publish(kindOf(kind), id, await req.json(), user));
});

/** ?draft=1 discards the draft, otherwise the document moves to trash (admin). */
export const DELETE = adminRoute<Ctx>("editor", async (req, user, { params }) => {
  const { kind, id } = await params;
  if (new URL(req.url).searchParams.get("draft")) {
    await discardDraft(kindOf(kind), id);
    return Response.json({ ok: true });
  }
  if (user.role !== "admin") return Response.json({ error: "Kräver administratörsbehörighet" }, { status: 403 });
  await trashDoc(kindOf(kind), id, user);
  return Response.json({ ok: true });
});
