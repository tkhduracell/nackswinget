// Maps rendered Divi page HTML (et_pb_* modules) onto the fixed section set.

import type { ColumnWidth, Section } from "@/lib/content/types";
import { type ConvertContext, docIsEmpty, htmlElementToDoc } from "./html";

export interface DiviContext extends ConvertContext {
  /** Calendar section config for the n-th calendar on this page, if known. */
  calendar(index: number): Extract<Section, { type: "calendar" }> | null;
  /** Category slug inferred from a rendered post list, if it's filtered. */
  postListCategory(articles: Element[]): string | undefined;
  /** Called when the page carries the "PowerPuff" star banner. */
  banner(text: string): void;
}

const EMBED_HOSTS = [/(^|\.)google\.[a-z.]+$/, /(^|\.)dans\.se$/, /(^|\.)youtube(-nocookie)?\.com$/, /(^|\.)forms\.office\.com$/];

export function isAllowedEmbed(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return EMBED_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

function hasClass(el: Element, cls: string): boolean {
  return (el.getAttribute("class") ?? "").split(/\s+/).includes(cls);
}

function columnWidth(el: Element): ColumnWidth {
  const m = (el.getAttribute("class") ?? "").match(/et_pb_column_(\d)_(\d)\b/);
  if (!m) return "1/1";
  const key = `${m[1]}/${m[2]}`;
  const map: Record<string, ColumnWidth> = { "1/4": "1/4", "1/3": "1/3", "1/2": "1/2", "2/3": "2/3", "3/4": "3/4", "4/4": "1/1" };
  return map[key] ?? "1/1";
}

class DiviMapper {
  private calendars = 0;
  constructor(private ctx: DiviContext) {}

  textToSections(el: Element, variant?: "boxTop" | "boxLeft"): Section[] {
    const out: Section[] = [];

    // Calendar shortcode output (rendered by the ICS plugin via AJAX).
    if (el.querySelector(".ics-calendar, [class*='r34ics'], [data-args]")) {
      const cal = this.ctx.calendar(this.calendars++);
      if (cal) {
        // Any heading/text before the calendar becomes rich text.
        const clone = el.cloneNode(true) as Element;
        clone.querySelectorAll(".ics-calendar, [class*='r34ics'], [data-args]").forEach((n) => n.remove());
        const doc = htmlElementToDoc(clone, this.ctx);
        if (!docIsEmpty(doc)) out.push({ type: "richText", doc, ...(variant ? { variant } : {}) });
        out.push(cal);
        return out;
      }
      this.ctx.flag("calendar without config");
    }

    // dans.se booking widgets: <a class="cwLoadContent" href="...">label</a> (+ lib.js script).
    const widgets = Array.from(el.querySelectorAll("a.cwLoadContent"));
    for (const a of widgets) {
      const href = (a.getAttribute("href") ?? "").trim();
      if (href) out.push({ type: "dansSeWidget", href, label: (a.textContent ?? "").trim() || "Boka på dans.se" });
      a.remove();
    }

    // Embedded iframes become embed sections.
    for (const iframe of Array.from(el.querySelectorAll("iframe"))) {
      const src = iframe.getAttribute("src") ?? "";
      if (isAllowedEmbed(src) && !/youtube/.test(src)) {
        const height = Number.parseInt(iframe.getAttribute("height") ?? "", 10);
        out.push({
          type: "embed",
          url: src,
          title: iframe.getAttribute("title") ?? "Inbäddat innehåll",
          aspect: /google\./.test(src) ? "4/3" : "auto",
          ...(Number.isFinite(height) && height > 0 ? { height } : {}),
        });
        iframe.remove();
      }
    }

    const doc = htmlElementToDoc(el, this.ctx);
    if (!docIsEmpty(doc)) out.unshift({ type: "richText", doc, ...(variant ? { variant } : {}) });
    return out;
  }

  linkBox(el: Element): { title: string; href: string; icon?: string } | null {
    const a = el.querySelector("a");
    if (!a) return null;
    const img = a.querySelector("img");
    const icon = img?.getAttribute("src") ?? undefined;
    return {
      title: (a.textContent ?? "").trim() || a.getAttribute("title") || "",
      href: this.ctx.rewriteHref(a.getAttribute("href") ?? ""),
      ...(icon ? { icon: icon.startsWith("data:") ? icon : undefined } : {}),
    };
  }

  module(el: Element): Section[] {
    // The new site renders breadcrumbs itself.
    if (hasClass(el, "lwp_divi_breadcrumbs")) return [];
    if (hasClass(el, "et_pb_text")) {
      if (hasClass(el, "nswStartPageLink")) {
        const box = this.linkBox(el);
        return box ? [{ type: "linkBoxes", items: [box] }] : [];
      }
      const variant = hasClass(el, "nswStartBoxBorderTop") ? "boxTop" : hasClass(el, "nswStartBoxBorderLeft") ? "boxLeft" : undefined;
      return this.textToSections(el.querySelector(".et_pb_text_inner") ?? el, variant);
    }
    if (hasClass(el, "et_pb_image")) {
      const img = el.querySelector("img");
      if (!img) return [];
      const attrs = this.ctx.resolveImage(img.getAttribute("src") ?? "", img.getAttribute("alt") ?? "", undefined, undefined);
      if (!attrs) return [];
      const link = el.querySelector("a")?.getAttribute("href");
      return [{ type: "image", image: attrs, ...(link ? { href: this.ctx.rewriteHref(link) } : {}) }];
    }
    if (hasClass(el, "et_pb_posts") || hasClass(el, "et_pb_blog_grid_wrapper") || hasClass(el, "et_pb_blog")) {
      const articles = Array.from(el.querySelectorAll("article"));
      return [
        {
          type: "postList",
          count: Math.max(1, Math.min(articles.length || 6, 50)),
          category: this.ctx.postListCategory(articles),
          showMore: !!el.querySelector(".pagination, .et_pb_ajax_pagination_container, .wp-pagenavi"),
        },
      ];
    }
    if (hasClass(el, "et_pb_divider")) return [{ type: "divider" }];
    if (hasClass(el, "et_pb_tabs")) {
      const titles = Array.from(el.querySelectorAll(".et_pb_tabs_controls li")).map((li) => (li.textContent ?? "").trim());
      const panes = Array.from(el.querySelectorAll(".et_pb_tab"));
      return panes.flatMap((pane, i) => {
        const inner = pane.querySelector(".et_pb_tab_content") ?? pane;
        const h = inner.ownerDocument.createElement("h2");
        h.textContent = titles[i] ?? `Del ${i + 1}`;
        inner.insertBefore(h, inner.firstChild);
        return this.textToSections(inner);
      });
    }
    if (hasClass(el, "et_pb_code") || hasClass(el, "et_pb_fullwidth_code")) {
      const inner = el.querySelector(".et_pb_code_inner") ?? el;
      if (hasClass(el, "powerpuff")) {
        this.ctx.banner((inner.textContent ?? "").trim());
        return [];
      }
      const html = inner.innerHTML;
      if (/notifications-api|firebase-messaging|subscribeTopic|Notification\.requestPermission/i.test(html)) {
        return [{ type: "pushSubscribe" }];
      }
      return this.textToSections(inner);
    }
    if (hasClass(el, "et_pb_fullwidth_header")) {
      const title = (el.querySelector(".et_pb_module_header")?.textContent ?? "").trim();
      const subtitle = (el.querySelector(".et_pb_header_content_wrapper")?.textContent ?? "").trim();
      const buttons = Array.from(el.querySelectorAll("a.et_pb_button"))
        .map((a) => ({ label: (a.textContent ?? "").trim(), href: this.ctx.rewriteHref(a.getAttribute("href") ?? "") }))
        .filter((b) => b.label && b.href)
        .slice(0, 2);
      const bgImg = el.querySelector(".et_pb_fullwidth_header_image img, img");
      const image = bgImg ? this.ctx.resolveImage(bgImg.getAttribute("src") ?? "", "", undefined, undefined) ?? undefined : undefined;
      return [{ type: "hero", title, ...(subtitle ? { subtitle } : {}), buttons, ...(image ? { image } : {}) }];
    }
    if (hasClass(el, "et_pb_button_module_wrapper") || hasClass(el, "et_pb_button")) {
      const a = el.tagName === "A" ? el : el.querySelector("a");
      if (!a) return [];
      return [
        {
          type: "richText",
          doc: {
            type: "doc",
            content: [{ type: "button", attrs: { href: this.ctx.rewriteHref(a.getAttribute("href") ?? ""), label: (a.textContent ?? "").trim() } }],
          },
        },
      ];
    }
    this.ctx.flag(`unknown Divi module: ${el.getAttribute("class")}`);
    return this.textToSections(el);
  }

  modules(column: Element): Section[] {
    const mods = Array.from(column.children).filter((c) => hasClass(c, "et_pb_module") || hasClass(c, "et_pb_button_module_wrapper"));
    return mergeLinkBoxes(mods.flatMap((m) => this.module(m)));
  }

  section(sec: Element): Section[] {
    if (hasClass(sec, "et_pb_fullwidth_section")) {
      return Array.from(sec.children).flatMap((m) => (hasClass(m, "et_pb_module") ? this.module(m) : []));
    }
    return Array.from(sec.querySelectorAll(":scope > .et_pb_row")).flatMap((row) => {
      const cols = Array.from(row.children).filter((c) => hasClass(c, "et_pb_column"));
      const nonEmpty = cols.filter((c) => !hasClass(c, "et_pb_column_empty"));
      // Rows whose columns are all full width (Divi specialty layouts) are just stacked content.
      if (nonEmpty.length <= 1 || nonEmpty.every((c) => columnWidth(c) === "1/1")) {
        return nonEmpty.flatMap((c) => this.modules(c));
      }
      return [{ type: "columns" as const, columns: nonEmpty.map((c) => ({ width: columnWidth(c), sections: this.modules(c) })) }];
    });
  }
}

export function mergeLinkBoxes(sections: Section[]): Section[] {
  const out: Section[] = [];
  for (const s of sections) {
    const prev = out[out.length - 1];
    if (s.type === "linkBoxes" && prev?.type === "linkBoxes") prev.items.push(...s.items);
    else out.push(s.type === "linkBoxes" ? { ...s, items: [...s.items] } : s);
  }
  return out;
}

/** Drops a leading rich text block that only repeats the page title (the layout renders it). */
export function dropTitleHeading(sections: Section[], title: string): Section[] {
  const first = sections[0];
  if (first?.type !== "richText") return sections;
  const [only, ...rest] = first.doc.content;
  const text = only?.type === "heading" ? (only.content ?? []).map((n) => (n.type === "text" ? n.text : "")).join("") : null;
  if (text === null || text.trim().toLowerCase() !== title.trim().toLowerCase()) return sections;
  return rest.length ? [{ ...first, doc: { ...first.doc, content: rest } }, ...sections.slice(1)] : sections.slice(1);
}

/** Page body -> sections. Non-Divi content becomes a single rich text block. */
export function contentToSections(root: Element, ctx: DiviContext): Section[] {
  const mapper = new DiviMapper(ctx);
  const sections = Array.from(root.querySelectorAll(".et_pb_section")).filter(
    (s) => !s.parentElement?.closest(".et_pb_section"),
  );
  if (sections.length === 0) {
    // Gutenberg "latest posts" block -> post list.
    const latest = root.querySelector("ul.wp-block-latest-posts");
    if (latest) {
      latest.remove();
      const rest = mapper.textToSections(root);
      return [...rest, { type: "postList", count: 10, showMore: true }];
    }
    return mapper.textToSections(root);
  }
  return sections.flatMap((s) => mapper.section(s));
}
