import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { getAdminAuth } from "@/lib/firebase/admin";

// Admin sign-in emails sent by the site itself instead of Firebase:
// - Firebase's hosted link handler (<project>.firebaseapp.com/__/auth/action)
//   rejects mode=signIn in this project, and the link target and email texts
//   can't be changed without custom SMTP. Here the link goes straight to
//   /admin/ on the site the request came from, where AuthProvider completes it.
// - Branded Swedish email from the club's own address.
// - Links are only created for allowlisted addresses.
//
// SMTP_URL (Secret Manager), e.g. smtps://outgoing%40nackswinget.se:PASSWORD@smtp.m101.websupport.se:465
// SMTP_FROM, e.g. "Dansklubben Nackswinget <outgoing@nackswinget.se>"

const PLACEHOLDER = "unset";

/** Hosts a sign-in link may point at (the link is built from the request origin). */
const ALLOWED_ORIGINS = new Set([
  "https://nsw-web--nackswinget-af7ef.europe-west4.hosted.app",
  "https://nackswinget.se",
  "https://www.nackswinget.se",
  "http://localhost:3100",
]);

export function smtpConfigured(): boolean {
  const url = process.env.SMTP_URL;
  return !!url && url !== PLACEHOLDER;
}

/** The request origin if it's one of the site's hosts, else null. */
export function linkOrigin(origin: string | null): string | null {
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
}

/** A sign-in link that opens /admin/ directly (not Firebase's hosted handler). */
export async function signInLink(email: string, origin: string): Promise<string> {
  const generated = new URL(await getAdminAuth().generateSignInWithEmailLink(email, { url: `${origin}/admin/`, handleCodeInApp: true }));
  const link = new URL(`${origin}/admin/`);
  for (const key of ["mode", "oobCode", "apiKey"]) {
    const value = generated.searchParams.get(key);
    if (value) link.searchParams.set(key, value);
  }
  link.searchParams.set("lang", "sv");
  return link.toString();
}

let transport: Transporter | null = null;

export async function sendLoginMail(email: string, link: string): Promise<void> {
  // SMTP_URL=log (local dev with the emulators): print the link instead of mailing it.
  const logOnly = process.env.SMTP_URL === "log";
  transport ??= logOnly ? nodemailer.createTransport({ jsonTransport: true }) : nodemailer.createTransport(process.env.SMTP_URL!);
  if (logOnly) console.log(`[login-mail] ${email}: ${link}`);
  const from = process.env.SMTP_FROM ?? "Dansklubben Nackswinget <outgoing@nackswinget.se>";
  const text = [
    "Hej!",
    "",
    "Klicka på länken för att logga in i administrationen för nackswinget.se:",
    link,
    "",
    "Länken kan bara användas en gång och slutar gälla efter en stund. Öppna den i samma webbläsare där du begärde den.",
    "",
    "Om du inte bad om att logga in kan du ignorera det här mejlet.",
    "",
    "Dansklubben Nackswinget",
  ].join("\n");
  const html = `<!doctype html>
<html lang="sv"><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Helvetica,Arial,sans-serif;color:#333">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="480" cellspacing="0" cellpadding="0" style="max-width:480px;background:#fff;border-radius:6px;overflow:hidden">
<tr><td style="background:#000;padding:18px 24px;color:#fff;font-size:18px;font-weight:bold">Dansklubben Nackswinget</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px;font-size:16px">Hej!</p>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5">Klicka på knappen för att logga in i administrationen för nackswinget.se.</p>
<p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#e0053d;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:4px">Logga in</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#6b6b6b;line-height:1.5">Länken kan bara användas en gång och slutar gälla efter en stund. Öppna den i samma webbläsare där du begärde den.</p>
<p style="margin:0;font-size:13px;color:#6b6b6b;line-height:1.5">Om du inte bad om att logga in kan du ignorera det här mejlet.</p>
</td></tr></table></td></tr></table></body></html>`;
  await transport.sendMail({ from, to: email, subject: "Logga in på Nackswinget", text, html });
}
