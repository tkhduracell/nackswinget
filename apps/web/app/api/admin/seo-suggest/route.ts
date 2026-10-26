import { adminRoute, HttpError } from "@/lib/admin/auth";
import { enabled, suggestSeo } from "@/lib/ai/seo-title";
import { postSchema } from "@/lib/content/types";

/** The editor's Autofyll button: Gemini's SEO title and description for the post as currently edited. */
export const POST = adminRoute("editor", async (req) => {
  if (!enabled()) throw new HttpError(503, "AI-förslag är inte aktiverat");
  const parsed = postSchema.safeParse({ id: "draft", ...(await req.json()) });
  if (!parsed.success) throw new HttpError(400, "Ogiltigt innehåll");
  if (!parsed.data.title.trim()) throw new HttpError(400, "Skriv en rubrik först");
  const seo = await suggestSeo(parsed.data);
  if (!seo) throw new HttpError(502, "AI kunde inte ge något förslag, försök igen");
  return Response.json(seo);
});
