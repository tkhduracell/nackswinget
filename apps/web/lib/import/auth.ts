import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Bootstrap import endpoints are guarded by IMPORT_TOKEN (Secret Manager,
 * see apphosting.yaml). Without the secret configured they don't exist.
 */
export function importAuthorized(req: Request): boolean | "disabled" {
  const expected = process.env.IMPORT_TOKEN;
  if (!expected) return "disabled";
  const got = req.headers.get("x-import-token") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function guard(req: Request): Response | null {
  const ok = importAuthorized(req);
  if (ok === "disabled") return new Response("Not found", { status: 404 });
  if (!ok) return new Response("Unauthorized", { status: 401 });
  return null;
}
