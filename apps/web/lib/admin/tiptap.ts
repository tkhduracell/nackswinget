// Conversion between TipTap editor JSON and the stored RichDoc schema.
// TipTap's StarterKit node/mark names already match ours; the differences
// are tables (tableHeader vs tableCell{header}) and extra attrs (link
// target/rel/class) which are stripped. Anything unknown is dropped.

import { type Mark, type RichDoc, type RichNode, richDocSchema } from "@/lib/content/types";

export interface TTNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TTNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

const PASS_THROUGH = new Set(["paragraph", "bulletList", "orderedList", "listItem", "blockquote", "hardBreak", "horizontalRule", "table", "tableRow"]);

function marksFrom(marks: TTNode["marks"]): Mark[] | undefined {
  const out: Mark[] = [];
  for (const m of marks ?? []) {
    if (m.type === "bold" || m.type === "italic") out.push({ type: m.type });
    else if (m.type === "link" && typeof m.attrs?.href === "string" && m.attrs.href) out.push({ type: "link", attrs: { href: m.attrs.href } });
  }
  return out.length ? out : undefined;
}

function fromNode(n: TTNode): RichNode | null {
  const content = (n.content ?? []).map(fromNode).filter((x): x is RichNode => x !== null);
  if (n.type === "text") {
    if (!n.text) return null;
    const marks = marksFrom(n.marks);
    return marks ? { type: "text", text: n.text, marks } : { type: "text", text: n.text };
  }
  if (n.type === "heading") {
    const level = n.attrs?.level === 3 ? 3 : 2;
    return { type: "heading", attrs: { level }, content };
  }
  if (n.type === "tableHeader" || n.type === "tableCell") {
    return { type: "tableCell", ...(n.type === "tableHeader" ? { attrs: { header: true } } : {}), content: content.length ? content : [{ type: "paragraph" }] };
  }
  if (n.type === "image") {
    const a = n.attrs ?? {};
    if (typeof a.src !== "string" || !a.src) return null;
    return {
      type: "image",
      attrs: {
        src: a.src,
        alt: typeof a.alt === "string" ? a.alt : "",
        ...(typeof a.width === "number" ? { width: a.width } : {}),
        ...(typeof a.height === "number" ? { height: a.height } : {}),
        variants: Array.isArray(a.variants) ? (a.variants as number[]) : [],
        ...(typeof a.displayWidth === "number" ? { displayWidth: a.displayWidth } : {}),
        ...(typeof a.href === "string" && a.href ? { href: a.href } : {}),
      },
    };
  }
  if (n.type === "video") {
    const a = n.attrs ?? {};
    if (a.provider === "youtube" && typeof a.id === "string") return { type: "video", attrs: { provider: "youtube", id: a.id, title: String(a.title ?? "") } };
    if (a.provider === "file" && typeof a.src720 === "string")
      return {
        type: "video",
        attrs: {
          provider: "file",
          src720: a.src720,
          ...(typeof a.src1080 === "string" ? { src1080: a.src1080 } : {}),
          ...(typeof a.poster === "string" ? { poster: a.poster } : {}),
          title: String(a.title ?? ""),
        },
      };
    return null;
  }
  if (n.type === "button") {
    const a = n.attrs ?? {};
    return typeof a.href === "string" && a.href ? { type: "button", attrs: { href: a.href, label: String(a.label ?? "Läs mer") } } : null;
  }
  if (PASS_THROUGH.has(n.type)) {
    if (n.type === "hardBreak" || n.type === "horizontalRule") return { type: n.type } as RichNode;
    return { type: n.type, content } as RichNode;
  }
  return null;
}

/** TipTap JSON -> validated RichDoc. */
export function fromTiptap(json: TTNode): RichDoc {
  const content = (json.content ?? [])
    .map(fromNode)
    .filter((x): x is RichNode => x !== null)
    // TipTap keeps an empty trailing paragraph; don't store it.
    .filter((n, i, all) => !(i === all.length - 1 && n.type === "paragraph" && !n.content?.length && all.length > 1));
  return richDocSchema.parse({ type: "doc", content });
}

function toNode(n: RichNode): TTNode {
  switch (n.type) {
    case "text":
      return { type: "text", text: n.text, ...(n.marks ? { marks: n.marks.map((m) => (m.type === "link" ? { type: "link", attrs: { href: m.attrs.href } } : { type: m.type })) } : {}) };
    case "tableCell":
      return { type: n.attrs?.header ? "tableHeader" : "tableCell", content: n.content.map(toNode) };
    case "heading":
      return { type: "heading", attrs: { level: n.attrs.level }, content: (n.content ?? []).map(toNode) };
    case "image":
    case "video":
    case "button":
      return { type: n.type, attrs: { ...n.attrs } };
    case "hardBreak":
    case "horizontalRule":
      return { type: n.type };
    default:
      return { type: n.type, ...("content" in n && n.content ? { content: n.content.map(toNode) } : {}) };
  }
}

/** RichDoc -> TipTap JSON. */
export function toTiptap(doc: RichDoc): TTNode {
  return { type: "doc", content: doc.content.length ? doc.content.map(toNode) : [{ type: "paragraph" }] };
}
