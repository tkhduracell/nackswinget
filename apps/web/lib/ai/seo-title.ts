import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { docToText } from "@/lib/import/html";
import type { Post } from "@/lib/content/types";

// Writes a post's SEO title with Gemini on Vertex AI when it is published
// (lib/admin/content.ts publish()). On App Hosting the runtime service account
// authenticates (needs roles/aiplatform.user); AI_SEO_TITLES=true turns it on.
// Any failure leaves the title empty: publishing never waits on or breaks for this.

const MODEL = "gemini-3.8-flash";
// Always the real project (the emulators run as demo-nsw, which has no Vertex AI).
const VERTEX_PROJECT = process.env.VERTEX_PROJECT ?? "nackswinget-af7ef";
// Gemini 3.8 Flash answers in 6–14 s even at low thinking. Publishing waits at most
// PUBLISH_TIMEOUT_MS; the Autofyll button, where the editor is watching, waits longer.
const PUBLISH_TIMEOUT_MS = 8000;
const BUTTON_TIMEOUT_MS = 30_000;
/** The site appends " | Nackswinget" (14 chars); Google shows about 60. */
export const MAX_SEO_TITLE = 50;
export const MIN_DESCRIPTION = 120;
export const MAX_DESCRIPTION = 155;

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

const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .replace(/^["'”„«»]+|["'”„«»]+$/g, "")
    .trim();

async function generate(post: Post, task: string, schema: Record<string, { type: "string" }>, timeoutMs: number): Promise<Record<string, string> | null> {
  if (!enabled() || !post.title.trim()) return null;
  client ??= new GoogleGenAI({ vertexai: true, project: VERTEX_PROJECT, location: "global" });
  const text = [post.excerpt, docToText(post.body)].filter(Boolean).join("\n\n").slice(0, 3000);
  try {
    const res = await client.models.generateContent({
      model: MODEL,
      contents: `${PROMPT}\n\n${task}\n\nRubrik: ${post.title}\n\nText:\n${text || "(ingen text)"}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseJsonSchema: { type: "object", properties: schema, required: Object.keys(schema) },
        abortSignal: AbortSignal.timeout(timeoutMs),
      },
    });
    const out = JSON.parse(res.text ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.keys(schema).map((k) => [k, clean(out[k])]));
  } catch (e) {
    console.error(`[seo-title] ${post.id}: ${(e as Error).message}`);
    return null;
  }
}

// A too-long title would be cut in the results; better to keep the headline.
const fitTitle = (t: string | undefined) => (t && t.length <= MAX_SEO_TITLE + 10 ? t : null);

export async function suggestSeoTitle(post: Post): Promise<string | null> {
  return fitTitle((await generate(post, "Skriv titeln.", { title: { type: "string" } }, PUBLISH_TIMEOUT_MS))?.title);
}

/** Title and description together, for the editor's Autofyll button. */
export async function suggestSeo(post: Post): Promise<{ title: string; description: string } | null> {
  const out = await generate(post, `Skriv titeln, och en beskrivning för Google och Facebook: ${MIN_DESCRIPTION}–${MAX_DESCRIPTION} tecken, en eller två meningar om vad nyheten handlar om, bara fakta från texten. Nämn gärna Nackswinget i beskrivningen där det faller sig naturligt.`, {
    title: { type: "string" },
    description: { type: "string" },
  }, BUTTON_TIMEOUT_MS);
  const title = fitTitle(out?.title);
  return title && out?.description ? { title, description: out.description } : null;
}
