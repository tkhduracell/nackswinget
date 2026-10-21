import { revalidateTag } from "next/cache";
import { snapshotSchema } from "@/lib/content/types";
import { guard } from "@/lib/import/auth";
import { writeSnapshot } from "@/lib/import/write";
import { CONTENT_TAGS } from "@/lib/content/cached";

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const parsed = snapshotSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "invalid snapshot", issues: parsed.error.issues.slice(0, 20) }, { status: 400 });
  }
  const result = await writeSnapshot(parsed.data);
  for (const tag of CONTENT_TAGS) revalidateTag(tag, "max");
  return Response.json({ ok: true, ...result });
}
