import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PuffBadge } from "@/components/PuffBadge";
import { type Banner, bannerSchema, PUFF_STYLES } from "@/lib/content/types";

const banner: Banner = { text: "Missa inte våra nya intensivkurser!", startAt: "2026-10-20T00:00:00.000Z", days: 7 };
const render = (b: Banner, id?: string) => renderToStaticMarkup(createElement(PuffBadge, { banner: b, id }));

describe("PuffBadge", () => {
  it("draws the old pink star when no style is set", () => {
    expect(render(banner)).toContain('class="star puff-classic"');
  });

  it.each(PUFF_STYLES)("keeps the text readable in .star-text for the %s style", (style) => {
    const html = render({ ...banner, style });
    expect(html).toContain(`puff-${style}`);
    expect(html).toMatch(/<span class="star-text"[^>]*>Missa inte våra nya intensivkurser!<\/span>/);
  });

  it("is a link only when the banner has one", () => {
    expect(render(banner)).toMatch(/^<div /);
    expect(render({ ...banner, href: "/kurser/" })).toMatch(/^<a class="star puff-classic" href="\/kurser\/"/);
  });

  it("scopes SVG ids so several puffs can share a page", () => {
    const html = render({ ...banner, style: "ring" }, "puff-2");
    expect(html).toContain('id="puff-2-ring"');
    expect(html).toContain('href="#puff-2-ring"');
  });

  it("shrinks long texts inside the shaped styles", () => {
    const short = render({ ...banner, style: "starburst", text: "Nya kurser!" });
    const long = render({ ...banner, style: "starburst", text: "x".repeat(110) });
    const size = (html: string) => Number(/font-size:([\d.]+)px/.exec(html)?.[1]);
    expect(size(short)).toBeGreaterThan(size(long));
    expect(size(long)).toBeGreaterThanOrEqual(11.5);
  });
});

describe("bannerSchema style", () => {
  it("accepts the known styles and leaves it optional", () => {
    expect(bannerSchema.parse({ ...banner, style: "tape" }).style).toBe("tape");
    expect(bannerSchema.parse(banner).style).toBeUndefined();
  });

  it("rejects unknown styles", () => {
    expect(bannerSchema.safeParse({ ...banner, style: "sparkles" }).success).toBe(false);
  });
});
