import { adminRoute } from "@/lib/admin/auth";
import { listRedirects, putRedirects } from "@/lib/admin/content";

export const GET = adminRoute("editor", async () => Response.json(await listRedirects()));

export const PUT = adminRoute("admin", async (req, user) => {
  await putRedirects(await req.json(), user);
  return Response.json(await listRedirects());
});
