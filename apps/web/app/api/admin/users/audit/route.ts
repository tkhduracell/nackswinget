import { adminRoute } from "@/lib/admin/auth";
import { listUserAudit } from "@/lib/admin/users";

export const GET = adminRoute("admin", async () => Response.json(await listUserAudit()));
