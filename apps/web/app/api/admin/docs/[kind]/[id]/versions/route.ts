import { adminRoute } from "@/lib/admin/auth";
import { kindOf, listVersions } from "@/lib/admin/content";

type Ctx = { params: Promise<{ kind: string; id: string }> };

export const GET = adminRoute<Ctx>("editor", async (_req, _user, { params }) => {
  const { kind, id } = await params;
  return Response.json(await listVersions(kindOf(kind), id));
});
