import { describe, expect, it } from "vitest";
import type { RichDoc } from "@/lib/content/types";
import { fromTiptap, toTiptap } from "./tiptap";

const doc: RichDoc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Rubrik" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Hej " },
        { type: "text", text: "länk", marks: [{ type: "bold" }, { type: "link", attrs: { href: "/kontakt/" } }] },
      ],
    },
    { type: "image", attrs: { src: "web/media/x/a.png", alt: "A", width: 800, height: 600, variants: [480, 800] } },
    { type: "video", attrs: { provider: "youtube", id: "abcdef123", title: "" } },
    { type: "button", attrs: { href: "/bli-medlem/", label: "Bli medlem" } },
    {
      type: "table",
      content: [
        { type: "tableRow", content: [{ type: "tableCell", attrs: { header: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "H" }] }] }] },
        { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "C" }] }] }] },
      ],
    },
  ],
};

describe("tiptap conversion", () => {
  it("round-trips the schema", () => {
    expect(fromTiptap(toTiptap(doc))).toEqual(doc);
  });

  it("strips disallowed marks, attrs and nodes", () => {
    const out = fromTiptap({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "x", marks: [{ type: "underline" }, { type: "link", attrs: { href: "https://a.se", target: "_blank", class: "c" } }] },
          ],
        },
        { type: "codeBlock", content: [{ type: "text", text: "evil" }] },
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "H1" }] },
        { type: "paragraph" },
      ],
    });
    expect(out.content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "https://a.se" } }] }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "H1" }] },
    ]);
  });

  it("gives the editor an empty paragraph for an empty doc", () => {
    expect(toTiptap({ type: "doc", content: [] })).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });
});
