import { docToText } from "@/lib/import/html";
import type { ImageAttrs, Page, Post, RichNode, Section } from "@/lib/content/types";
import { imageUrl, publicUrl, variantPath } from "@/lib/media/urls";
import { sectionsText } from "@/lib/seo";

// Finds the SEO fields an LLM may fill in (scripts/seo-fill.ts): image alt
// texts and meta descriptions that are empty or weak. Only gaps are listed;
// anything an editor wrote is left alone. Pure, so it runs in the import
// endpoint and in tests alike.

export type Kind = "pages" | "posts";
/** JSON path from the document root to an ImageAttrs object. */
export type JsonPath = (string | number)[];

interface GapBase {
  kind: Kind;
  id: string;
  url: string;
  title: string;
  /** The value when the gap was found; apply refuses if it changed since. */
  current: string;
  /** Text around the gap, for the model. */
  context: string;
}
export type DescriptionGap = GapBase & { field: "description" };
export type AltGap = GapBase & { field: "alt"; path: JsonPath; src: string; imageUrl: string };
export type Gap = DescriptionGap | AltGap;

/** Below this the snippet Google shows is mostly empty. */
export const MIN_DESCRIPTION = 70;
const CONTEXT_CHARS = 4000;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

export function gapKey(g: Pick<Gap, "kind" | "id" | "field"> & { path?: JsonPath }): string {
  return [g.kind, g.id, g.field, ...(g.path ?? [])].join("/");
}

/** Alt text that says nothing: empty, a file name, or the file's own name. */
export function weakAlt(alt: string, src: string): boolean {
  const a = alt.trim();
  if (!a) return true;
  if (/\.(jpe?g|png|webp|gif|avif|svg)$/i.test(a)) return true;
  const base = src.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") ?? "";
  return a.toLowerCase() === base.toLowerCase();
}

/** The description the page gets today when no SEO description is set (see app/(site)/[[...slug]]/page.tsx). */
function fallbackDescription(kind: Kind, doc: Page | Post): string {
  return squash(kind === "pages" ? sectionsText((doc as Page).sections) : (doc as Post).excerpt || docToText((doc as Post).body));
}

function fullText(kind: Kind, doc: Page | Post): string {
  return squash(kind === "pages" ? sectionsText((doc as Page).sections) : docToText((doc as Post).body));
}

/** Medium-size variant for the model (cheaper than the 1600 px one, plenty to describe). */
function modelImageUrl(image: ImageAttrs): string {
  if (image.variants.includes(960)) return publicUrl(variantPath(image.src, 960));
  return imageUrl(image.src, image.variants);
}

/** Every content image of a document with its path. Hero backgrounds are decorative and skipped. */
export function imagesOf(kind: Kind, doc: Page | Post): { path: JsonPath; image: ImageAttrs; caption?: string }[] {
  const out: { path: JsonPath; image: ImageAttrs; caption?: string }[] = [];
  const walkRich = (nodes: RichNode[] | undefined, path: JsonPath) => {
    nodes?.forEach((n, i) => {
      if (n.type === "image") out.push({ path: [...path, i, "attrs"], image: n.attrs });
      else if ("content" in n) walkRich(n.content, [...path, i, "content"]);
    });
  };
  const walkSections = (sections: Section[], path: JsonPath) => {
    sections.forEach((s, i) => {
      const at = [...path, i];
      if (s.type === "image") out.push({ path: [...at, "image"], image: s.image, caption: s.caption });
      else if (s.type === "richText") walkRich(s.doc.content, [...at, "doc", "content"]);
      else if (s.type === "columns") s.columns.forEach((c, j) => walkSections(c.sections, [...at, "columns", j, "sections"]));
    });
  };
  if (kind === "pages") walkSections((doc as Page).sections, ["sections"]);
  else {
    const post = doc as Post;
    if (post.image) out.push({ path: ["image"], image: post.image });
    walkRich(post.body.content, ["body", "content"]);
  }
  return out;
}

export function findGaps(input: { pages: Page[]; posts: Post[] }): Gap[] {
  const gaps: Gap[] = [];
  const docs: [Kind, Page | Post][] = [
    ...input.pages.filter((p) => p.status === "published" && p.template !== "blank").map((p) => ["pages", p] as [Kind, Page]),
    ...input.posts.filter((p) => p.status === "published").map((p) => ["posts", p] as [Kind, Post]),
  ];
  for (const [kind, doc] of docs) {
    const url = kind === "pages" ? ((doc as Page).path ? `/${(doc as Page).path}/` : "/") : `/${(doc as Post).slug}/`;
    const text = fullText(kind, doc);
    const base = { kind, id: doc.id, url, title: doc.title };
    if (!doc.seo.description?.trim()) {
      const current = fallbackDescription(kind, doc);
      if (current.length < MIN_DESCRIPTION) gaps.push({ ...base, field: "description", current: "", context: text.slice(0, CONTEXT_CHARS) });
    }
    for (const { path, image, caption } of imagesOf(kind, doc)) {
      if (!weakAlt(image.alt, image.src)) continue;
      gaps.push({
        ...base,
        field: "alt",
        path,
        src: image.src,
        imageUrl: modelImageUrl(image),
        current: image.alt,
        context: squash([caption ? `Bildtext: ${caption}` : "", text.slice(0, 600)].filter(Boolean).join("\n")),
      });
    }
  }
  return gaps;
}

export type ApplyResult = "applied" | "stale" | "not-found";

/**
 * Writes one suggestion into a document (mutating it), only if the field still
 * holds the value it had when the gap was found: an editor's later change wins.
 */
export function applySuggestion(doc: Page | Post, s: { field: "description" | "alt"; path?: JsonPath; src?: string; current: string; value: string }): ApplyResult {
  if (s.field === "description") {
    if ((doc.seo.description ?? "").trim() !== s.current) return "stale";
    doc.seo = { ...doc.seo, description: s.value };
    return "applied";
  }
  let target: unknown = doc;
  for (const key of s.path ?? []) {
    if (target === null || typeof target !== "object") return "not-found";
    target = (target as Record<string | number, unknown>)[key];
  }
  const image = target as Partial<ImageAttrs> | undefined;
  if (!image || typeof image !== "object" || image.src !== s.src) return "not-found";
  if ((image.alt ?? "") !== s.current) return "stale";
  image.alt = s.value;
  return "applied";
}
