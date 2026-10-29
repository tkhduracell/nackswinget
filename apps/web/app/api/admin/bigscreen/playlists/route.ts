import { z } from "zod";
import { adminRoute } from "@/lib/admin/auth";
import { createPlaylist, listPlaylists } from "@/lib/bigscreen/admin";

export const GET = adminRoute("editor", async () => Response.json(await listPlaylists()));

export const POST = adminRoute("editor", async (req, user) => {
  const { name } = z.object({ name: z.string().max(80).default("") }).parse(await req.json().catch(() => ({})));
  return Response.json(await createPlaylist(name, user));
});
