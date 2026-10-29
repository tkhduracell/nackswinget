import { getScreenByKey, recordHeartbeat } from "@/lib/bigscreen/store";
import { heartbeatSchema } from "@/lib/bigscreen/types";

// The player reports what it shows once a minute; the admin uses it for
// the online status.
export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const parsed = heartbeatSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig data" }, { status: 400 });
  const screen = await getScreenByKey(key);
  if (!screen) return Response.json({ error: "Okänd skärm" }, { status: 404 });
  await recordHeartbeat(screen, { ...parsed.data, userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300) });
  return new Response(null, { status: 204 });
}
