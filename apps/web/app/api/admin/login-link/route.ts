import { after } from "next/server";
import { z } from "zod";
import { roleFor } from "@/lib/admin/auth";
import { linkOrigin, sendLoginMail, signInLink, smtpConfigured } from "@/lib/admin/login-mail";

// Public (no auth): sends an admin sign-in link to allowlisted addresses.
// The lookup and send run after the response, so status and timing are the
// same for every address and the allowlist can't be probed. Send failures are
// only logged; the user just asks for a new link.

const bodySchema = z.object({ email: z.email().transform((e) => e.trim().toLowerCase()) });

// One mail per address per minute (per instance; the site runs one).
const lastSent = new Map<string, number>();

function rateLimited(email: string, now: number): boolean {
  for (const [key, at] of lastSent) if (now - at >= 60_000) lastSent.delete(key);
  return lastSent.has(email);
}

export async function POST(req: Request) {
  if (!smtpConfigured()) return Response.json({ fallback: true }, { status: 503 });
  // Only from the site's own pages (a text/plain cross-site POST skips CORS preflight).
  const origin = linkOrigin(req.headers.get("origin"));
  if (!origin) return Response.json({ error: "Forbidden" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig e-postadress" }, { status: 400 });
  const { email } = parsed.data;

  const now = Date.now();
  if (rateLimited(email, now)) return Response.json({ ok: true });
  lastSent.set(email, now);

  after(async () => {
    try {
      if (await roleFor(email)) await sendLoginMail(email, await signInLink(email, origin));
    } catch (e) {
      lastSent.delete(email); // a retry may go out right away
      console.error(`login link for ${email.replace(/^(.).*@/, "$1***@")} failed: ${(e as Error).message}`);
    }
  });
  return Response.json({ ok: true });
}
