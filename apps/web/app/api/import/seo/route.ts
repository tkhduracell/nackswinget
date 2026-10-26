import { z } from "zod";
import { publish } from "@/lib/admin/content";
import type { AdminUser } from "@/lib/admin/auth";
import type { Page, Post } from "@/lib/content/types";
import { pageSchema, postSchema } from "@/lib/content/types";
import { getDb } from "@/lib/firebase/admin";
import { guard } from "@/lib/import/auth";
import { applySuggestion, findGaps, type ApplyResult, type Kind } from "@/lib/seo-fill";

// SEO gap filling (scripts/seo-fill.ts), guarded by IMPORT_TOKEN like the rest of /api/import/.
//   GET  -> alt texts and meta descriptions that are empty or weak, read fresh from Firestore
//   POST -> writes reviewed suggestions through the admin's publish(): versions, audit, cache refresh

const FILL_USER: AdminUser = { uid: "seo-fill", email: "seo-fill@nackswinget.se", role: "admin" };

async function load(kind: Kind): Promise<(Page | Post)[]> {
  const snap = await getDb().collection(kind).get();
  const schema = kind === "pages" ? pageSchema : postSchema;
  return snap.docs.flatMap((d) => {
    const parsed = schema.safeParse({ id: d.id, ...d.data() });
    return parsed.success ? [parsed.data as Page | Post] : [];
  });
}

async function draftIds(): Promise<Set<string>> {
  const snap = await getDb().collection("drafts").select("kind", "id").get();
  return new Set(snap.docs.map((d) => `${d.get("kind")}/${d.get("id")}`));
}

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const [pages, posts, drafts] = await Promise.all([load("pages"), load("posts"), draftIds()]);
  // A document with an open draft is skipped: publishing would discard the editor's draft.
  const gaps = findGaps({ pages: pages as Page[], posts: posts as Post[] }).filter((g) => !drafts.has(`${g.kind}/${g.id}`));
  return Response.json({ gaps, skippedWithDraft: [...drafts] });
}

const itemSchema = z.object({
  kind: z.enum(["pages", "posts"]),
  id: z.string().min(1),
  field: z.enum(["description", "alt"]),
  path: z.array(z.union([z.string(), z.number()])).optional(),
  src: z.string().optional(),
  current: z.string(),
  value: z.string().trim().min(1).max(300),
});

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const parsed = z.object({ items: z.array(itemSchema).max(1000) }).safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "invalid body", issues: parsed.error.issues.slice(0, 10) }, { status: 400 });

  const drafts = await draftIds();
  const byDoc = new Map<string, z.infer<typeof itemSchema>[]>();
  for (const item of parsed.data.items) byDoc.set(`${item.kind}/${item.id}`, [...(byDoc.get(`${item.kind}/${item.id}`) ?? []), item]);

  const results: { kind: Kind; id: string; field: string; path?: (string | number)[]; result: ApplyResult | "draft" }[] = [];
  for (const [key, items] of byDoc) {
    const [kind, id] = key.split("/") as [Kind, string];
    const note = (result: ApplyResult | "draft") => items.forEach((i) => results.push({ kind, id, field: i.field, path: i.path, result }));
    if (drafts.has(key)) {
      note("draft");
      continue;
    }
    const snap = await getDb().collection(kind).doc(id).get();
    if (!snap.exists) {
      note("not-found");
      continue;
    }
    const doc = { id, ...snap.data() } as Page | Post;
    let changed = false;
    for (const item of items) {
      const result = applySuggestion(doc, item);
      changed ||= result === "applied";
      results.push({ kind, id, field: item.field, path: item.path, result });
    }
    if (changed) await publish(kind, id, doc, FILL_USER);
  }
  return Response.json({ results });
}
