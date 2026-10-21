import { adminRoute } from "@/lib/admin/auth";
import { deleteUser, listUsers, putUser } from "@/lib/admin/users";

export const GET = adminRoute("admin", async () => Response.json(await listUsers()));

export const PUT = adminRoute("admin", async (req, user) => Response.json(await putUser(await req.json(), user)));

export const DELETE = adminRoute("admin", async (req, user) => {
  await deleteUser(new URL(req.url).searchParams.get("email") ?? "", user);
  return Response.json({ ok: true });
});
