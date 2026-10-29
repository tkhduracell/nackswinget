import { createHash } from "node:crypto";
import { playerPayload } from "@/lib/bigscreen/store";

// Polled by the Storbild player every 30 s. The ETag is a hash of the
// resolved payload, so media finishing transcoding or a block's date window
// opening also counts as a change, not only a publish.
export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const payload = await playerPayload(key);
  if (!payload) return Response.json({ error: "Okänd skärm" }, { status: 404 });
  const body = JSON.stringify(payload);
  const etag = `"${createHash("sha1").update(body).digest("base64url")}"`;
  const headers = { ETag: etag, "Cache-Control": "no-store" };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { headers: { ...headers, "Content-Type": "application/json" } });
}
