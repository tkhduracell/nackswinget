// Converts WordPress/Divi HTML into the restricted RichDoc schema.
// Anything outside the schema (fonts, colours, inline styles) is dropped.

import type { ImageAttrs, Mark, RichDoc, RichNode } from "@/lib/content/types";

export interface MediaInfo {
  width?: number;
  height?: number;
  alt?: string;
}

export interface ConvertContext {
  /** Maps an absolute/relative URL to its site-relative form (or external URL). */
  rewriteHref(href: string): string;
  /** Resolves an <img src> to ImageAttrs, or null to drop the image. */
  resolveImage(src: string, alt: string, width?: number, height?: number): ImageAttrs | null;
  /** Called for content the converter can't represent. */
  flag(reason: string): void;
}

type El = Element;

/** Where a block (button, image, video) was lifted out of inline content; paragraphs split there. */
const HOIST = "__hoist";
type Marker = { type: typeof HOIST; node: RichNode };
const marker = (node: RichNode) => ({ type: HOIST, node }) as unknown as RichNode;
const isMarker = (n: RichNode): boolean => (n as unknown as Marker).type === HOIST;

const BLOCK_TAGS = new Set([
  "P", "DIV", "SECTION", "ARTICLE", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI",
  "BLOCKQUOTE", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", "FIGURE", "FIGCAPTION",
  "HR", "PRE", "IFRAME", "VIDEO", "CENTER", "HEADER", "FOOTER", "MAIN", "ASIDE", "DL", "DT", "DD",
]);
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "FORM", "INPUT", "BUTTON", "SELECT"]);

function isElement(n: Node): n is El {
  return n.nodeType === 1;
}

function intAttr(el: El, name: string): number | undefined {
  const v = Number.parseInt(el.getAttribute(name) ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

export function youtubeId(url: string): string | null {
  const m =
    url.match(/youtube(?:-nocookie)?\.com\/(?:embed|shorts|live)\/([\w-]{6,})/) ??
    url.match(/youtube\.com\/watch\?(?:.*&)?v=([\w-]{6,})/) ??
    url.match(/youtu\.be\/([\w-]{6,})/);
  return m ? m[1] : null;
}

function sameMarks(a: Mark[] | undefined, b: Mark[] | undefined): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

/** Collapse whitespace, merge adjacent text nodes, trim the run's edges. */
function normalizeInline(nodes: RichNode[]): RichNode[] {
  const out: RichNode[] = [];
  for (const n of nodes) {
    if (n.type === "text") {
      const text = n.text.replace(/[\s ]+/g, " ");
      if (!text) continue;
      const prev = out[out.length - 1];
      if (prev?.type === "text" && sameMarks(prev.marks, n.marks)) {
        prev.text = (prev.text + text).replace(/ {2,}/g, " ");
      } else {
        out.push({ ...n, text });
      }
    } else {
      out.push(n);
    }
  }
  // Trim leading/trailing spaces and spaces around hard breaks.
  for (let i = 0; i < out.length; i++) {
    const n = out[i];
    if (n.type !== "text") continue;
    if (i === 0 || out[i - 1].type === "hardBreak") n.text = n.text.replace(/^ +/, "");
    if (i === out.length - 1 || out[i + 1].type === "hardBreak") n.text = n.text.replace(/ +$/, "");
  }
  const filtered = out.filter((n) => n.type !== "text" || n.text.length > 0);
  while (filtered[0]?.type === "hardBreak") filtered.shift();
  while (filtered[filtered.length - 1]?.type === "hardBreak") filtered.pop();
  return filtered;
}

class Converter {
  constructor(private ctx: ConvertContext) {}

  /** Inline content of an element; block-level media found inside is left as a marker in place. */
  inline(el: Node, marks: Mark[]): RichNode[] {
    const out: RichNode[] = [];
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 3) {
        out.push({ type: "text", text: child.textContent ?? "", ...(marks.length ? { marks } : {}) });
        continue;
      }
      if (!isElement(child) || SKIP_TAGS.has(child.tagName)) continue;
      const tag = child.tagName;
      if (isSpacer(child)) {
        // Editors used white "." characters as vertical spacing.
        continue;
      } else if (tag === "BR") {
        out.push({ type: "hardBreak" });
      } else if (tag === "STRONG" || tag === "B") {
        out.push(...this.inline(child, addMark(marks, { type: "bold" })));
      } else if (tag === "EM" || tag === "I") {
        out.push(...this.inline(child, addMark(marks, { type: "italic" })));
      } else if (tag === "A") {
        const raw = child.getAttribute("href") ?? "";
        const href = raw ? this.ctx.rewriteHref(raw) : "";
        const cls = child.getAttribute("class") ?? "";
        if (/\bet_pb_button\b|\bwp-block-button__link\b|\bbig-button\b/.test(cls) && href) {
          out.push(marker({ type: "button", attrs: { href, label: (child.textContent ?? "").trim() } }));
          continue;
        }
        const inner = this.inline(child, href && !href.startsWith("#") ? addMark(marks, { type: "link", attrs: { href } }) : marks);
        out.push(...inner);
      } else if (tag === "IMG") {
        const link = marks.find((m) => m.type === "link");
        const img = this.image(child, link?.type === "link" ? link.attrs.href : undefined);
        if (img) out.push(marker(img));
      } else if (tag === "IFRAME") {
        const v = this.iframe(child);
        if (v) out.push(marker(v));
      } else if (BLOCK_TAGS.has(tag)) {
        // Block inside inline context (e.g. <div> inside <a>): flatten.
        out.push(...this.inline(child, marks));
      } else {
        out.push(...this.inline(child, marks));
      }
    }
    return out;
  }

  image(el: El, href?: string): RichNode | null {
    const src = el.getAttribute("src") ?? el.getAttribute("data-src") ?? "";
    if (!src || src.startsWith("data:")) return null;
    const attrs = this.ctx.resolveImage(src, el.getAttribute("alt") ?? "", intAttr(el, "width"), intAttr(el, "height"));
    if (!attrs) return null;
    const shown = displayWidth(el);
    return {
      type: "image",
      attrs: { ...attrs, ...(shown && (!attrs.width || shown < attrs.width) ? { displayWidth: shown } : {}), ...(href ? { href } : {}) },
    };
  }

  iframe(el: El): RichNode | null {
    const src = el.getAttribute("src") ?? el.getAttribute("data-src") ?? "";
    const id = youtubeId(src);
    if (id) return { type: "video", attrs: { provider: "youtube", id, title: el.getAttribute("title") ?? "" } };
    this.ctx.flag(`iframe dropped from rich text: ${src}`);
    return null;
  }

  paragraphFrom(el: Node): RichNode[] {
    const content = normalizeInline(this.inline(el, []));
    const out: RichNode[] = [];
    // Two or more line breaks in a row separate paragraphs.
    let run: RichNode[] = [];
    let breaks = 0;
    const flush = () => {
      const trimmed = normalizeInline(run);
      if (trimmed.length) out.push({ type: "paragraph", content: trimmed });
      run = [];
    };
    for (const n of content) {
      if (isMarker(n)) {
        flush();
        out.push((n as unknown as Marker).node);
        breaks = 0;
        continue;
      }
      if (n.type === "hardBreak") {
        breaks++;
        continue;
      }
      if (breaks >= 2) flush();
      else if (breaks === 1) run.push({ type: "hardBreak" });
      breaks = 0;
      run.push(n);
    }
    flush();
    return out;
  }

  blocks(el: Node): RichNode[] {
    const out: RichNode[] = [];
    let pendingInline: Node[] = [];
    const flushInline = () => {
      if (pendingInline.length === 0) return;
      const holder = { childNodes: pendingInline } as unknown as Node;
      out.push(...this.paragraphFrom(holder));
      pendingInline = [];
    };

    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 3) {
        // Whitespace between two inline elements is a word gap ("<b>till</b> <a>kurser</a>").
        if ((child.textContent ?? "").trim() || pendingInline.length) pendingInline.push(child);
        continue;
      }
      if (!isElement(child)) continue;
      const tag = child.tagName;
      if (SKIP_TAGS.has(tag)) continue;
      if (!BLOCK_TAGS.has(tag) && tag !== "IMG") {
        pendingInline.push(child);
        continue;
      }
      flushInline();
      out.push(...this.block(child));
    }
    flushInline();
    return out;
  }

  block(el: El): RichNode[] {
    const tag = el.tagName;
    switch (tag) {
      case "P":
      case "PRE":
      case "DT":
      case "DD":
      case "FIGCAPTION":
        return this.paragraphFrom(el);
      case "H1":
      case "H2":
      case "H3":
      case "H4":
      case "H5":
      case "H6": {
        // Blocks inside a heading go after it.
        const inline = this.inline(el, []);
        const hoisted = inline.filter(isMarker).map((n) => (n as unknown as Marker).node);
        const content = normalizeInline(inline.filter((n) => !isMarker(n)));
        // The old theme styled <h1> as the big bold heading and everything else as small ones.
        const level = tag === "H1" ? 2 : 3;
        // Headings are styled by the theme; drop bold marks inside them.
        const plain = content.map((n) =>
          n.type === "text" && n.marks ? { ...n, marks: n.marks.filter((m) => m.type === "link") } : n,
        ).map((n) => (n.type === "text" && n.marks?.length === 0 ? { type: "text" as const, text: n.text } : n));
        return [...(plain.length ? [{ type: "heading" as const, attrs: { level: level as 2 | 3 }, content: plain }] : []), ...hoisted];
      }
      case "UL":
      case "OL": {
        const items = Array.from(el.children)
          .filter((c) => c.tagName === "LI")
          .map((li) => {
            const content = this.blocks(li).filter((n) => n.type !== "heading");
            return { type: "listItem" as const, content: content.length ? content : [{ type: "paragraph" as const }] };
          })
          .filter((li) => li.content.some((n) => n.type !== "paragraph" || (n.content?.length ?? 0) > 0));
        if (!items.length) return [];
        return [{ type: tag === "UL" ? "bulletList" : "orderedList", content: items }];
      }
      case "BLOCKQUOTE": {
        const content = this.blocks(el);
        return content.length ? [{ type: "blockquote", content }] : [];
      }
      case "TABLE":
        return this.table(el);
      case "HR":
        return [{ type: "horizontalRule" }];
      case "IMG": {
        const img = this.image(el);
        return img ? [img] : [];
      }
      case "IFRAME": {
        const v = this.iframe(el);
        return v ? [v] : [];
      }
      case "VIDEO":
        this.ctx.flag("<video> element dropped; re-upload the video");
        return [];
      default:
        // Wrapper elements (div, figure, section, ...): recurse.
        return this.blocks(el);
    }
  }

  table(el: El): RichNode[] {
    const rows = Array.from(el.querySelectorAll("tr"))
      .map((tr) => ({
        type: "tableRow" as const,
        content: Array.from(tr.children)
          .filter((c) => c.tagName === "TD" || c.tagName === "TH")
          .map((cell) => {
            const content = this.blocks(cell).filter((n) => n.type === "paragraph" || n.type === "heading" || n.type === "image");
            return {
              type: "tableCell" as const,
              ...(cell.tagName === "TH" ? { attrs: { header: true } } : {}),
              content: content.length ? content : [{ type: "paragraph" as const }],
            };
          }),
      }))
      .filter((r) => r.content.length > 0);
    return rows.length ? [{ type: "table", content: rows }] : [];
  }
}

/** The width the old content showed an image at: the width attribute or an inline style width in px. */
export function displayWidth(el: El): number | undefined {
  const style = (el.getAttribute("style") ?? "").match(/(?:^|;)\s*width:\s*(\d+)px/i);
  return style ? Number(style[1]) : intAttr(el, "width");
}

const WHITE = /color:\s*(#fff(fff)?|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))\s*(;|$)/i;

/** A white span holding only dots/whitespace: an invisible spacer in the old theme. */
function isSpacer(el: El): boolean {
  return WHITE.test(el.getAttribute("style") ?? "") && /^[\s.\u00a0]*$/.test(el.textContent ?? "");
}

function addMark(marks: Mark[], m: Mark): Mark[] {
  return marks.some((x) => x.type === m.type) ? marks : [...marks, m];
}

export function htmlElementToDoc(root: Element, ctx: ConvertContext): RichDoc {
  const content = new Converter(ctx).blocks(root).filter(
    (n) => n.type !== "paragraph" || (n.content?.length ?? 0) > 0,
  );
  return { type: "doc", content };
}

export function docIsEmpty(doc: RichDoc): boolean {
  return doc.content.length === 0;
}

/** Plain text of a doc (for excerpts, search and llms.txt). */
export function docToText(doc: { content?: RichNode[] } | RichNode): string {
  const parts: string[] = [];
  const walk = (n: RichNode | { content?: RichNode[] }) => {
    if ("type" in n && n.type === "text") {
      parts.push(n.text);
      return;
    }
    if ("type" in n && n.type === "hardBreak") parts.push("\n");
    const children = "content" in n ? n.content : undefined;
    if (children) {
      for (const c of children) walk(c);
      if ("type" in n && ["paragraph", "heading", "listItem", "tableRow"].includes(n.type)) parts.push("\n");
    }
  };
  walk(doc);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}
