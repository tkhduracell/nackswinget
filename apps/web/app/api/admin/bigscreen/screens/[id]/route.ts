import { z } from "zod";
import { adminRoute } from "@/lib/admin/auth";
import { deleteScreen, screenAction, updateScreen } from "@/lib/bigscreen/admin";

type Ctx = { params: Promise<{ id: string }> };

/** Name, playlist, quality, light mode. Editors may only switch the playlist. */
export const PATCH = adminRoute<Ctx>("editor", async (req, user, { params }) => {
  const body = (await req.json()) as Record<string, unknown>;
  const input = user.role === "admin" ? body : { playlistId: body.playlistId };
  return Response.json(await updateScreen((await params).id, input, user));
});

/** `{ action: "reload" }` (editors) or `{ action: "rotate" }` (admins). */
export const POST = adminRoute<Ctx>("editor", async (req, user, { params }) => {
  const { action } = z.object({ action: z.enum(["reload", "rotate"]) }).parse(await req.json());
  if (action === "rotate" && user.role !== "admin") return Response.json({ error: "Kräver administratörsbehörighet" }, { status: 403 });
  return Response.json(await screenAction((await params).id, action, user));
});

export const DELETE = adminRoute<Ctx>("admin", async (_req, user, { params }) => {
  await deleteScreen((await params).id, user);
  return Response.json({ ok: true });
});
