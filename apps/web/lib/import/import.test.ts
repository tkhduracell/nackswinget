import { readFileSync } from "node:fs";
import path from "node:path";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { BUILTIN_DANCER, DANCER_PNG_SHA1, builtinIcon } from "@/lib/content/icons";
import type { ImageAttrs, Section } from "@/lib/content/types";
import { contentToSections, isAllowedEmbed, linkBoxIcon, mergeLinkBoxes } from "./divi";
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

describe("htmlElementToDoc (old theme quirks)", () => {
  it("drops white dot spacers and splits paragraphs on double line breaks", () => {
    const doc = htmlElementToDoc(
      root(`<p>Villkor.<br /><span style="color: #ffffff;">.</span><br /><span style="color: #ffffff;">.</span><br />Nästa<br />rad</p>`),
      ctx,
    );
    expect(doc.content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "Villkor." }] },
      { type: "paragraph", content: [{ type: "text", text: "Nästa" }, { type: "hardBreak" }, { type: "text", text: "rad" }] },
    ]);
  });

  it("keeps a button where it was in the paragraph", () => {
    const doc = htmlElementToDoc(root(`<p>Före<br /><a class="big-button" href="https://dans.se/x">Knapp</a><br />Efter</p>`), ctx);
    expect(doc.content.map((n) => n.type)).toEqual(["paragraph", "button", "paragraph"]);
  });

  it("keeps a linked image's link and its displayed width", () => {
    const doc = htmlElementToDoc(root(`<p><a href="https://play.google.com/x"><img src="/wp-content/uploads/badge.png" width="190" style="height:60px;width:190px" /></a></p>`), ctx);
    expect(doc.content[0]).toMatchObject({ type: "image", attrs: { displayWidth: 190, href: "https://play.google.com/x" } });
  });

  it("keeps the space between two inline elements", () => {
    const doc = htmlElementToDoc(root(`<div><strong>Tillgång till</strong> <a href="/kurser/">kurser</a></div>`), ctx);
    expect(docToText(doc)).toBe("Tillgång till kurser");
  });

  it("turns big-button links into buttons", () => {
    const doc = htmlElementToDoc(root(`<p><a href="https://dans.se/nsw/mship/new" class="big-button bigpink">Bli medlem!</a></p>`), ctx);
    expect(doc.content).toEqual([{ type: "button", attrs: { href: "https://dans.se/nsw/mship/new", label: "Bli medlem!" } }]);
  });

  it("keeps headings inside table cells", () => {
    const doc = htmlElementToDoc(root(`<table><tr><td><h2><strong>Viktigt</strong></h2></td></tr></table>`), ctx);
    expect(docToText(doc)).toContain("Viktigt");
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

  it("maps the WordPress dancer PNG to the built-in animated icon", () => {
    const dancer = `data:image/png;base64,${readFileSync(path.resolve(import.meta.dirname, "../../test/fixtures/dancer-icon.png")).toString("base64")}`;
    const other = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    expect(linkBoxIcon(dancer)).toBe(BUILTIN_DANCER);
    expect(linkBoxIcon(other)).toBe(other);
    expect(linkBoxIcon("https://nackswinget.se/wp-content/uploads/a.png")).toBeUndefined();
    expect(linkBoxIcon(undefined)).toBeUndefined();

    const box = (src: string) =>
      `<div class="et_pb_module et_pb_text nswStartPageLink"><div class="et_pb_text_inner"><a href="https://nackswinget.se/kurser/"><img src="${src}">Våra Kurser &amp; träningar</a></div></div>`;
    const sections = contentToSections(root(`<div class="et_pb_section"><div class="et_pb_row"><div class="et_pb_column et_pb_column_4_4">${box(dancer)}${box(other)}</div></div></div>`), diviCtx);
    expect(sections).toEqual([
      {
        type: "linkBoxes",
        items: [
          { title: "Våra Kurser & träningar", href: "/kurser/", icon: "builtin:dancer" },
          { title: "Våra Kurser & träningar", href: "/kurser/", icon: other },
        ],
      },
    ]);
    expect(builtinIcon("builtin:dancer")).toBe("dancer");
    expect(builtinIcon(`web/icons/${DANCER_PNG_SHA1.slice(0, 16)}.png`)).toBe("dancer");
    expect(builtinIcon(other)).toBeNull();
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

  it("maps 3/5 + 2/5 rows, boxes nswBoxes rows and drops the title band", () => {
    const text = (t: string) => `<div class="et_pb_module et_pb_text"><div class="et_pb_text_inner"><p>${t}</p></div></div>`;
    const html = `
      <div class="et_pb_section et_pb_with_background"><div class="et_pb_row"><div class="et_pb_column et_pb_column_4_4">
        <div class="et_pb_module et_pb_text"><div class="et_pb_text_inner"><h1>Bandtitel</h1></div></div>
      </div></div></div>
      <div class="et_pb_section">
        <div class="et_pb_row"><div class="et_pb_column et_pb_column_3_5">${text("Bild")}</div><div class="et_pb_column et_pb_column_2_5">${text("Styrelsen")}</div></div>
        <div class="et_pb_row nswBoxes"><div class="et_pb_column et_pb_column_1_3">${text("A")}</div><div class="et_pb_column et_pb_column_1_3">${text("B")}</div></div>
      </div>`;
    let band = "";
    const sections = contentToSections(root(html), { ...diviCtx, bandTitle: (t: string) => (band = t) }) as Extract<Section, { type: "columns" }>[];
    expect(band).toBe("Bandtitel");
    expect(sections).toHaveLength(2);
    expect(sections[0].columns.map((c) => c.width)).toEqual(["3/5", "2/5"]);
    expect(sections[1].columns.map((c) => c.sections[0])).toMatchObject([{ variant: "boxLeft" }, { variant: "boxLeft" }]);
  });

  it("keeps a heading-only first row that isn't a coloured band", () => {
    const html = `<div class="et_pb_section"><div class="et_pb_row"><div class="et_pb_column et_pb_column_4_4">
      <div class="et_pb_module et_pb_text"><div class="et_pb_text_inner"><h1>Välkommen</h1></div></div></div></div></div>`;
    expect(contentToSections(root(html), diviCtx)).toMatchObject([{ type: "richText" }]);
  });

  it("reads the hero subtitle", () => {
    const html = `<div class="et_pb_section et_pb_fullwidth_section"><div class="et_pb_module et_pb_fullwidth_header">
      <h1 class="et_pb_module_header">Nackswinget</h1><span class="et_pb_fullwidth_header_subhead">Upplev dansglädjen</span></div></div>`;
    expect(contentToSections(root(html), diviCtx)).toMatchObject([{ type: "hero", title: "Nackswinget", subtitle: "Upplev dansglädjen" }]);
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

  it("only allows known embed hosts", () => {
    expect(isAllowedEmbed("https://www.google.com/maps/embed?pb=1")).toBe(true);
    expect(isAllowedEmbed("https://dans.se/tools/comp/events/?org=nsw")).toBe(true);
    expect(isAllowedEmbed("https://evil.example/x")).toBe(false);
  });
});
