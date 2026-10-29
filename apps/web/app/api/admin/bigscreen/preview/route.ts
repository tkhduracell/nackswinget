import { z } from "zod";
import { adminRoute, HttpError } from "@/lib/admin/auth";
import { resolveForPlayer } from "@/lib/bigscreen/store";
import { blockSchema } from "@/lib/bigscreen/types";

/** Resolves unpublished blocks for the editor's preview, the way a 1080p screen would play them. */
export const POST = adminRoute("editor", async (req) => {
  const parsed = z.object({ blocks: z.array(blockSchema).max(200) }).safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, "Ogiltig spellista");
  return Response.json(await resolveForPlayer(parsed.data.blocks, "1080"));
});
