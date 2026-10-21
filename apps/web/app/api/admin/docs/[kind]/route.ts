import { adminRoute } from "@/lib/admin/auth";
import { kindOf, listDocs } from "@/lib/admin/content";

type Ctx = { params: Promise<{ kind: string }> };

export const GET = adminRoute<Ctx>("editor", async (_req, _user, { params }) => Response.json(await listDocs(kindOf((await params).kind))));
