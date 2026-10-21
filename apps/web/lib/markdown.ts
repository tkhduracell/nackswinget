import type { Mark, Page, Post, RichDoc, RichNode, Section } from "@/lib/content/types";
import { imageUrl } from "@/lib/media/urls";

// Markdown renderings for LLMs (/md/<path>.md and /llms.txt).

function inline(nodes: RichNode[] | undefined): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === "hardBreak") return "  \n";
      if (n.type !== "text") return "";
      let t = n.text.replace(/([*_`[\]])/g, "\\$1");
      const marks: Mark[] = n.marks ?? [];
      if (marks.some((m) => m.type === "bold")) t = `**${t}**`;
      if (marks.some((m) => m.type === "italic")) t = `*${t}*`;
      const link = marks.find((m) => m.type === "link");
      if (link && link.type === "link") t = `[${t}](${link.attrs.href})`;
      return t;
    })
    .join("");
}

function block(n: RichNode, depth = 0): string {
  switch (n.type) {
    case "paragraph":
      return inline(n.content);
    case "heading":
      return `${"#".repeat(n.attrs.level)} ${inline(n.content)}`;
    case "bulletList":
    case "orderedList":
      return n.content
        .map((li, i) => {
          const body = li.type === "listItem" ? li.content.map((c) => block(c, depth + 1)).join("\n") : "";
          return `${"  ".repeat(depth)}${n.type === "bulletList" ? "-" : `${i + 1}.`} ${body.trim()}`;
        })
        .join("\n");
    case "blockquote":
      return n.content.map((c) => `> ${block(c)}`).join("\n");
    case "image":
      return `![${n.attrs.alt}](${imageUrl(n.attrs.src, n.attrs.variants)})`;
    case "video":
      return n.attrs.provider === "youtube" ? `[Video: ${n.attrs.title || "YouTube"}](https://www.youtube.com/watch?v=${n.attrs.id})` : "";
    case "button":
      return `[${n.attrs.label}](${n.attrs.href})`;
    case "horizontalRule":
      return "---";
    case "table": {
      const rows = n.content.map((r) => (r.type === "tableRow" ? r.content.map((c) => (c.type === "tableCell" ? c.content.map((x) => block(x)).join(" ") : "")) : []));
      if (!rows.length) return "";
      const cols = Math.max(...rows.map((r) => r.length));
      const line = (r: string[]) => `| ${Array.from({ length: cols }, (_, i) => (r[i] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`;
      return [line(rows[0]), `|${" --- |".repeat(cols)}`, ...rows.slice(1).map(line)].join("\n");
    }
    default:
      return "";
  }
}

export function docToMarkdown(doc: RichDoc): string {
  return doc.content.map((n) => block(n)).filter(Boolean).join("\n\n");
}

function sectionsToMarkdown(sections: Section[]): string {
  return sections
    .map((s) => {
      switch (s.type) {
        case "hero":
          return [`## ${s.title}`, s.subtitle, ...s.buttons.map((b) => `[${b.label}](${b.href})`)].filter(Boolean).join("\n\n");
        case "richText":
          return docToMarkdown(s.doc);
        case "columns":
          return s.columns.map((c) => sectionsToMarkdown(c.sections)).join("\n\n");
        case "linkBoxes":
          return s.items.map((i) => `- [${i.title}](${i.href})`).join("\n");
        case "fileList":
          return [s.title && `## ${s.title}`, ...s.items.map((f) => `- [${f.title}](${f.href})`)].filter(Boolean).join("\n");
        case "calendar":
          return "_Kalender: se https://nackswinget.se/kalender/_";
        case "postList":
          return "_Senaste nyheter: se https://nackswinget.se/nyheter/_";
        case "embed":
          return `[${s.title}](${s.url})`;
        case "dansSeWidget":
          return `[${s.label}](${s.href})`;
        case "image":
          return `![${s.image.alt}](${imageUrl(s.image.src, s.image.variants)})`;
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n\n");
}

export function pageToMarkdown(page: Page, siteUrl: string): string {
  return `# ${page.title}\n\nKälla: ${siteUrl}/${page.path ? `${page.path}/` : ""}\n\n${sectionsToMarkdown(page.sections)}\n`;
}

export function postToMarkdown(post: Post, siteUrl: string): string {
  return `# ${post.title}\n\nPublicerad: ${post.publishedAt.slice(0, 10)}  \nKälla: ${siteUrl}/${post.slug}/\n\n${docToMarkdown(post.body)}\n`;
}
