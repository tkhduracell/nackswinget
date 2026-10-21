import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import type { ImageAttrs, Section } from "@/lib/content/types";
import { contentToSections, dropTitleHeading, isAllowedEmbed, mergeLinkBoxes } from "./divi";
import { docToText, htmlElementToDoc, youtubeId } from "./html";

function root(html: string) {
  const { document } = parseHTML(`<!doctype html><html><body><div id="r">${html}</div></body></html>`);
  return document.getElementById("r")!;
}

const ctx = {
  rewriteHref: (h: string) => h.replace("https://nackswinget.se", ""),
  resolveImage: (src: string, alt: string): ImageAttrs => ({ src: `web/uploads/${src.split("/").pop()}`, alt, variants: [480] }),
  flag: () => {},
};

describe("htmlElementToDoc", () => {
  it("keeps the restricted schema and drops styling", () => {
    const doc = htmlElementToDoc(
      root(`<h1 style="color:red">Titel</h1><p>Hej <strong>du</strong> <span style="font-size:40px">där</span> <a href="https://nackswinget.se/kontakt/">kontakt</a></p><h4>Liten</h4>`),
      ctx,
    );
    expect(doc.content[0]).toEqual({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Titel" }] });
    expect(doc.content[1]).toEqual({
      type: "paragraph",
      content: [
        { type: "text", text: "Hej " },
        { type: "text", text: "du", marks: [{ type: "bold" }] },
        { type: "text", text: " där " },
        { type: "text", text: "kontakt", marks: [{ type: "link", attrs: { href: "/kontakt/" } }] },
      ],
    });
    expect(doc.content[2]).toMatchObject({ type: "heading", attrs: { level: 3 } });
  });

  it("hoists images out of paragraphs and converts lists and tables", () => {
    const doc = htmlElementToDoc(root(`<p>Före<img src="/wp-content/uploads/a.png" alt="A"></p><ul><li>Ett</li><li>Två</li></ul><table><tr><th>H</th></tr><tr><td>C</td></tr></table>`), ctx);
    expect(doc.content.map((n) => n.type)).toEqual(["paragraph", "image", "bulletList", "table"]);
    expect(docToText(doc)).toContain("Ett");
  });

  it("turns YouTube iframes into video nodes", () => {
    const doc = htmlElementToDoc(root(`<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>`), ctx);
    expect(doc.content[0]).toMatchObject({ type: "video", attrs: { provider: "youtube", id: "dQw4w9WgXcQ" } });
  });

  it("collapses whitespace and drops empty paragraphs", () => {
    const doc = htmlElementToDoc(root(`<p>  a \n  b </p><p>&nbsp;</p>`), ctx);
    expect(doc.content).toEqual([{ type: "paragraph", content: [{ type: "text", text: "a b" }] }]);
  });
});

describe("youtubeId", () => {
  it("parses common URL forms", () => {
    expect(youtubeId("https://youtu.be/abcdef123")).toBe("abcdef123");
    expect(youtubeId("https://www.youtube.com/watch?v=abcdef123&t=1")).toBe("abcdef123");
    expect(youtubeId("https://example.com")).toBeNull();
  });
});

describe("contentToSections", () => {
  const diviCtx = {
    ...ctx,
    calendar: () => ({ type: "calendar" as const, feeds: ["huvud"], hiddenByDefault: [], view: "list" as const, pastDays: 0, showLegend: false }),
    postListCategory: () => undefined,
    banner: () => {},
  };

  it("maps Divi rows, columns and link boxes", () => {
    const html = `
      <div class="et_pb_section"><div class="et_pb_row">
        <div class="et_pb_column et_pb_column_3_4"><div class="et_pb_module et_pb_posts"><article></article><article></article></div></div>
        <div class="et_pb_column et_pb_column_1_4">
          <div class="et_pb_module et_pb_text nswStartPageLink"><div class="et_pb_text_inner"><a href="https://nackswinget.se/kurser/">Kurser</a></div></div>
          <div class="et_pb_module et_pb_text nswStartPageLink"><div class="et_pb_text_inner"><a href="https://nackswinget.se/kalender/">Kalender</a></div></div>
        </div>
      </div></div>`;
    const sections = contentToSections(root(html), diviCtx);
    expect(sections).toHaveLength(1);
    const cols = sections[0] as Extract<Section, { type: "columns" }>;
    expect(cols.columns.map((c) => c.width)).toEqual(["3/4", "1/4"]);
    expect(cols.columns[0].sections[0]).toMatchObject({ type: "postList", count: 2 });
    expect(cols.columns[1].sections).toEqual([
      { type: "linkBoxes", items: [{ title: "Kurser", href: "/kurser/" }, { title: "Kalender", href: "/kalender/" }] },
    ]);
  });

  it("skips breadcrumbs and turns powerpuff into a banner", () => {
    let banner = "";
    const html = `<div class="et_pb_section et_pb_fullwidth_section">
      <div class="et_pb_module lwp_divi_breadcrumbs">Hem » X</div>
      <div class="et_pb_module et_pb_fullwidth_code powerpuff"><div class="et_pb_code_inner">Ställ klockan</div></div>
    </div>`;
    const sections = contentToSections(root(html), { ...diviCtx, banner: (t: string) => (banner = t) });
    expect(sections).toEqual([]);
    expect(banner).toBe("Ställ klockan");
  });

  it("falls back to one rich text block for non-Divi content", () => {
    expect(contentToSections(root("<p>Hej</p>"), diviCtx)).toMatchObject([{ type: "richText" }]);
  });
});

describe("helpers", () => {
  it("merges adjacent link boxes only", () => {
    const merged = mergeLinkBoxes([
      { type: "linkBoxes", items: [{ title: "a", href: "/a/" }] },
      { type: "linkBoxes", items: [{ title: "b", href: "/b/" }] },
      { type: "divider" },
      { type: "linkBoxes", items: [{ title: "c", href: "/c/" }] },
    ]);
    expect(merged.map((s) => s.type)).toEqual(["linkBoxes", "divider", "linkBoxes"]);
  });

  it("drops a leading heading that repeats the page title", () => {
    const doc = { type: "doc" as const, content: [{ type: "heading" as const, attrs: { level: 2 as const }, content: [{ type: "text" as const, text: "Kalender" }] }] };
    expect(dropTitleHeading([{ type: "richText", doc }, { type: "divider" }], "Kalender")).toEqual([{ type: "divider" }]);
  });

  it("only allows known embed hosts", () => {
    expect(isAllowedEmbed("https://www.google.com/maps/embed?pb=1")).toBe(true);
    expect(isAllowedEmbed("https://dans.se/tools/comp/events/?org=nsw")).toBe(true);
    expect(isAllowedEmbed("https://evil.example/x")).toBe(false);
  });
});
