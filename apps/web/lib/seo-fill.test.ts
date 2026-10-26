import { describe, expect, it } from "vitest";
import type { Page, Post } from "@/lib/content/types";
import { applySuggestion, findGaps, gapKey, weakAlt } from "./seo-fill";

const img = (src: string, alt = "") => ({ src, alt, variants: [480, 960], width: 1200, height: 800 });
const now = "2026-01-01T00:00:00Z";

const page: Page = {
  id: "p1",
  path: "kurser",
  title: "Kurser",
  parentId: null,
  template: "default",
  status: "published",
  publishedAt: now,
  updatedAt: now,
  seo: {},
  sections: [
    { type: "hero", title: "Kurser", image: img("web/uploads/bg.jpg"), buttons: [] },
    {
      type: "columns",
      columns: [
        { width: "1/2", sections: [{ type: "image", image: img("web/uploads/a.jpg"), caption: "Kursstart" }] },
        { width: "1/2", sections: [{ type: "richText", doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Kort." }] }, { type: "image", attrs: img("web/uploads/b.png", "b.png") }] } }] },
      ],
    },
    { type: "image", image: img("web/uploads/c.jpg", "Par som dansar bugg på Ceylon") },
  ],
} as Page;

const post: Post = {
  id: "n1",
  slug: "nyhet",
  title: "Nyhet",
  excerpt: "Lång ingress som redan räcker gott och väl för en beskrivning i sökresultaten hos Google, utan tvekan.",
  body: { type: "doc", content: [] },
  categories: [],
  image: img("web/uploads/n.jpg"),
  status: "published",
  publishedAt: now,
  updatedAt: now,
  seo: {},
};

describe("weakAlt", () => {
  it("flags empty alts and file names", () => {
    expect(weakAlt("", "web/uploads/a.jpg")).toBe(true);
    expect(weakAlt("glad-pc3a5sk.png", "web/uploads/x.png")).toBe(true);
    expect(weakAlt("Stefan", "web/uploads/2020/Stefan.png")).toBe(true);
    expect(weakAlt("Par som dansar bugg", "web/uploads/a.jpg")).toBe(false);
  });
});

describe("findGaps", () => {
  const gaps = findGaps({ pages: [page], posts: [post] });

  it("finds weak alts in nested sections and rich text, not hero backgrounds or good alts", () => {
    const alts = gaps.filter((g) => g.field === "alt").map((g) => (g.field === "alt" ? g.src : ""));
    expect(alts).toEqual(["web/uploads/a.jpg", "web/uploads/b.png", "web/uploads/n.jpg"]);
  });

  it("finds short descriptions only where the fallback is too thin", () => {
    expect(gaps.filter((g) => g.field === "description").map((g) => g.url)).toEqual(["/kurser/"]);
  });

  it("skips documents an editor already described, drafts and blank pages", () => {
    const described = { ...page, seo: { description: "Satt av redaktör." } };
    const draft = { ...post, status: "draft" as const };
    const out = findGaps({ pages: [described, { ...page, id: "b", template: "blank" as const }], posts: [draft] });
    expect(out.some((g) => g.field === "description")).toBe(false);
    expect(out.every((g) => g.id === "p1")).toBe(true);
  });

  it("asks the model for the 960 px variant", () => {
    const g = gaps.find((g) => g.field === "alt");
    expect(g && g.field === "alt" && g.imageUrl).toMatch(/\/web\/variants\/uploads\/a\/960\.webp$/);
  });
});

describe("applySuggestion", () => {
  it("writes alt at the gap's path and description into seo", () => {
    const doc = structuredClone(page);
    const [alt] = findGaps({ pages: [doc], posts: [] }).filter((g) => g.field === "alt");
    if (alt.field !== "alt") throw new Error();
    expect(applySuggestion(doc, { ...alt, value: "Kursdeltagare dansar" })).toBe("applied");
    expect(applySuggestion(doc, { field: "description", current: "", value: "Ny beskrivning" })).toBe("applied");
    expect(findGaps({ pages: [doc], posts: [] }).map(gapKey)).toEqual([gapKey({ kind: "pages", id: "p1", field: "alt", path: ["sections", 1, "columns", 1, "sections", 0, "doc", "content", 1, "attrs"] })]);
    expect(doc.seo.description).toBe("Ny beskrivning");
  });

  it("leaves fields an editor changed since the suggestion", () => {
    const doc = structuredClone(page);
    const [alt] = findGaps({ pages: [doc], posts: [] }).filter((g) => g.field === "alt");
    if (alt.field !== "alt") throw new Error();
    (doc.sections[1] as Extract<Page["sections"][number], { type: "columns" }>).columns[0].sections[0] = { type: "image", image: img("web/uploads/a.jpg", "Redaktörens text") };
    expect(applySuggestion(doc, { ...alt, value: "Förslag" })).toBe("stale");
    expect(applySuggestion({ ...doc, seo: { description: "Redaktör" } }, { field: "description", current: "", value: "Förslag" })).toBe("stale");
    expect(applySuggestion(doc, { ...alt, src: "web/uploads/other.jpg", value: "Förslag" })).toBe("not-found");
  });
});
