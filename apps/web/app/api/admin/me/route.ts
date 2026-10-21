import { adminRoute } from "@/lib/admin/auth";

export const GET = adminRoute("editor", async (_req, user) => Response.json(user));
