import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { docToText } from "@/lib/import/html";
import type { Post } from "@/lib/content/types";
import { PROJECT_ID } from "@/lib/firebase/admin";

// Writes a post's SEO title with Gemini on Vertex AI when it is published
// (lib/admin/content.ts publish()). On App Hosting the runtime service account
// authenticates (needs roles/aiplatform.user); AI_SEO_TITLES=true turns it on.
// Any failure leaves the title empty: publishing never waits on or breaks for this.

const MODEL = "gemini-3.8-flash";
const TIMEOUT_MS = 8000;
/** The site appends " | Nackswinget" (14 chars); Google shows about 60. */
export const MAX_SEO_TITLE = 50;

const PROMPT = `Du skriver SEO-titlar för nyheter på Dansklubben Nackswingets webbplats (bugg, fox, socialdans, kurser och tävlingar i Nacka).
Skriv en titel för Google på svenska, högst ${MAX_SEO_TITLE} tecken.
- Säg tydligt vad nyheten handlar om, med de ord någon skulle söka på (t.ex. buggkurs, tedans, tävling, datum om det är det viktiga).
- Ta inte med "Nackswinget" eller "Dansklubben": det läggs till automatiskt.
- Inga citattecken, inga utropstecken, ingen klickbete, inga påhittade fakta.`;

/** Generate when the title is empty, or when an earlier generated title was for an older headline. */
export function needsSeoTitle(post: Post, previousHeadline?: string): boolean {
  if (!post.seo.title?.trim()) return true;
  return !!post.seo.titleAuto && previousHeadline !== undefined && previousHeadline !== post.title;
}

export function enabled(): boolean {
  return process.env.AI_SEO_TITLES === "true";
}

let client: GoogleGenAI | null = null;

export async function suggestSeoTitle(post: Post): Promise<string | null> {
  if (!enabled() || !post.title.trim()) return null;
  client ??= new GoogleGenAI({ vertexai: true, project: PROJECT_ID, location: "global" });
  const text = [post.excerpt, docToText(post.body)].filter(Boolean).join("\n\n").slice(0, 3000);
  try {
    const res = await client.models.generateContent({
      model: MODEL,
      contents: `${PROMPT}\n\nRubrik: ${post.title}\n\nText:\n${text || "(ingen text)"}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseJsonSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      },
    });
    const title = String((JSON.parse(res.text ?? "{}") as { title?: unknown }).title ?? "")
      .replace(/\s+/g, " ")
      .replace(/^["'”„«»]+|["'”„«»]+$/g, "")
      .trim();
    // A too-long answer would be cut in the results; better to keep the headline.
    return title && title.length <= MAX_SEO_TITLE + 10 ? title : null;
  } catch (e) {
    console.error(`[seo-title] ${post.id}: ${(e as Error).message}`);
    return null;
  }
}
