import { revalidateTag } from "next/cache";
import { TAG } from "@/lib/content/cached";
import { COLLECTIONS } from "@/lib/content/firestore-store";
import type { Banner } from "@/lib/content/types";
import { getDb } from "@/lib/firebase/admin";
import { guard } from "@/lib/import/auth";

// Called by Cloud Scheduler every 10 minutes (job "web-scheduled-publish").
// Cached pages freeze "now" when they render, so a post scheduled for later
// (or a star banner starting/expiring) only appears once its cache tag is
// revalidated. This checks whether anything crossed its time since the last
// run and revalidates just those tags.
export async function POST(req: Request) {
  const denied = guard(req, "CRON_TOKEN");
  if (denied) return denied;

  const db = getDb();
  const stateRef = db.collection(COLLECTIONS.site).doc("cron");
  const now = new Date();
  const last = new Date(((await stateRef.get()).get("lastRunAt") as string | undefined) ?? now.toISOString());

  const due = await db
    .collection(COLLECTIONS.posts)
    .where("publishedAt", ">", last.toISOString())
    .where("publishedAt", "<=", now.toISOString())
    .select("status")
    .get();
  const posts = due.docs.filter((d) => d.get("status") !== "draft").length;

  const banners = (((await db.collection(COLLECTIONS.site).doc("banners").get()).get("items") as Banner[] | undefined) ?? []).filter((b) => {
    const start = new Date(b.startAt).getTime();
    const end = start + b.days * 86_400_000;
    return [start, end].some((t) => t > last.getTime() && t <= now.getTime());
  }).length;

  if (posts) revalidateTag(TAG.posts, "max");
  if (banners) revalidateTag(TAG.site, "max");
  await stateRef.set({ lastRunAt: now.toISOString() });
  return Response.json({ ok: true, since: last.toISOString(), posts, banners });
}
