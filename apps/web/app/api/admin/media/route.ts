import { z } from "zod";
import { adminRoute, HttpError } from "@/lib/admin/auth";
import { createUpload, listMedia } from "@/lib/admin/media";

export const GET = adminRoute("editor", async () => Response.json(await listMedia()));

const uploadSchema = z.object({ name: z.string().min(1).max(200), contentType: z.string().max(120), size: z.number().int().nonnegative(), width: z.number().int().positive().max(20_000).optional(), height: z.number().int().positive().max(20_000).optional() });

/** Starts an upload: returns the media doc and a resumable Cloud Storage session URL. */
export const POST = adminRoute("editor", async (req, user) => {
  const parsed = uploadSchema.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, "Ogiltig fil");
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  return Response.json(await createUpload(parsed.data, user, origin));
});
