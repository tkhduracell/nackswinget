import { describe, expect, it } from "vitest";
import type { Post } from "@/lib/content/types";
import { needsSeoTitle } from "./seo-title";

const post = (seo: Post["seo"], title = "Ny buggkurs i höst"): Post => ({
  id: "1",
  slug: "kurs",
  title,
  excerpt: "",
  body: { type: "doc", content: [] },
  categories: [],
  status: "published",
  publishedAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  seo,
});

describe("needsSeoTitle", () => {
  it("fills an empty title", () => {
    expect(needsSeoTitle(post({}))).toBe(true);
    expect(needsSeoTitle(post({ title: "  " }), "Ny buggkurs i höst")).toBe(true);
  });

  it("never touches a title the editor wrote", () => {
    expect(needsSeoTitle(post({ title: "Buggkurs hösten 2026" }), "Gammal rubrik")).toBe(false);
  });

  it("rewrites an AI title only when the headline changed", () => {
    expect(needsSeoTitle(post({ title: "Buggkurs i höst", titleAuto: true }), "Ny buggkurs i höst")).toBe(false);
    expect(needsSeoTitle(post({ title: "Buggkurs i höst", titleAuto: true }), "Gammal rubrik")).toBe(true);
  });
});
