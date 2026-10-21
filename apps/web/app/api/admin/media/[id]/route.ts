import { z } from "zod";
import { adminRoute } from "@/lib/admin/auth";
import { finalizeUpload, refreshMedia, trashMedia, updateMedia } from "@/lib/admin/media";

type Ctx = { params: Promise<{ id: string }> };

/** Current state (polls video transcoding). */
export const GET = adminRoute<Ctx>("editor", async (_req, _user, { params }) => Response.json(await refreshMedia((await params).id)));

/** Upload finished: process the file. */
export const POST = adminRoute<Ctx>("editor", async (_req, user, { params }) => Response.json(await finalizeUpload((await params).id, user)));

export const PATCH = adminRoute<Ctx>("editor", async (req, user, { params }) => {
  const patch = z.object({ alt: z.string().optional() }).parse(await req.json());
  return Response.json(await updateMedia((await params).id, patch, user));
});

export const DELETE = adminRoute<Ctx>("editor", async (_req, user, { params }) => {
  await trashMedia((await params).id, user);
  return Response.json({ ok: true });
});

export const maxDuration = 300;
