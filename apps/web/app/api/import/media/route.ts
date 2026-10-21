import { z } from "zod";
import { guard } from "@/lib/import/auth";
import { getBucket } from "@/lib/firebase/admin";
import { storeMedia } from "@/lib/media/process";
import { wpUploadPath } from "@/lib/media/urls";

const bodySchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(40),
  source: z.url().default("https://nackswinget.se"),
  force: z.boolean().default(false),
});

const UA = "Mozilla/5.0 (compatible; nackswinget-import/1.0)";

// Copies WordPress uploads into Storage (original + WebP variants).
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });

  const results: { path: string; ok: boolean; skipped?: boolean; status?: number; variants?: number[]; error?: string }[] = [];
  for (const rel of parsed.data.paths) {
    try {
      // Re-runs only copy what's missing.
      if (!parsed.data.force) {
        const [exists] = await getBucket().file(wpUploadPath(rel)).exists();
        if (exists) {
          results.push({ path: rel, ok: true, skipped: true });
          continue;
        }
      }
      const url = `${parsed.data.source}/wp-content/uploads/${rel.split("/").map(encodeURIComponent).join("/")}`;
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || type.startsWith("text/html")) {
        results.push({ path: rel, ok: false, status: res.status, error: type.startsWith("text/html") ? "html response" : undefined });
        continue;
      }
      const data = Buffer.from(await res.arrayBuffer());
      const stored = await storeMedia(wpUploadPath(rel), data, type.split(";")[0] || undefined);
      results.push({ path: rel, ok: true, variants: stored.variants });
    } catch (e) {
      results.push({ path: rel, ok: false, error: (e as Error).message });
    }
    // Be gentle with the WordPress host's bot protection.
    await new Promise((r) => setTimeout(r, 250));
  }
  return Response.json({ results });
}

export const maxDuration = 300;
