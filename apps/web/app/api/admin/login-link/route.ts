import { z } from "zod";
import { roleFor } from "@/lib/admin/auth";
import { linkOrigin, sendLoginMail, signInLink, smtpConfigured } from "@/lib/admin/login-mail";

// Public (no auth): sends an admin sign-in link to allowlisted addresses.
// Always answers the same way so it can't be used to probe the allowlist.

const bodySchema = z.object({ email: z.email().transform((e) => e.trim().toLowerCase()) });

// One mail per address per minute (per instance; the site runs one).
const lastSent = new Map<string, number>();

export async function POST(req: Request) {
  if (!smtpConfigured()) return Response.json({ fallback: true }, { status: 503 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig e-postadress" }, { status: 400 });
  const { email } = parsed.data;

  const now = Date.now();
  if (now - (lastSent.get(email) ?? 0) < 60_000) return Response.json({ ok: true });
  lastSent.set(email, now);

  try {
    if (await roleFor(email)) {
      await sendLoginMail(email, await signInLink(email, linkOrigin(req.headers.get("origin"))));
    }
  } catch (e) {
    console.error(`login link for ${email} failed: ${(e as Error).message}`);
    return Response.json({ error: "Kunde inte skicka länken just nu" }, { status: 502 });
  }
  return Response.json({ ok: true });
}
