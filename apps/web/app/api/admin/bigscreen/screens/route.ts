import { adminRoute } from "@/lib/admin/auth";
import { createScreen, listScreens } from "@/lib/bigscreen/admin";

export const GET = adminRoute("editor", async () => Response.json(await listScreens()));

export const POST = adminRoute("admin", async (req, user) => Response.json(await createScreen(await req.json(), user)));
