import { describe, expect, it } from "vitest";
import { bannerExpiresAt, isBannerActive } from "@/lib/content/types";
import { publicUrl, srcSet, variantPath, variantWidthsFor, wpUploadPath } from "./urls";

describe("media urls", () => {
  it("maps WordPress uploads and variants deterministically", () => {
    expect(wpUploadPath("2022/11/a b.png")).toBe("web/uploads/2022/11/a b.png");
    expect(variantPath("web/uploads/2022/11/a.png", 960)).toBe("web/variants/uploads/2022/11/a/960.webp");
    expect(publicUrl("web/uploads/a b.png")).toBe("https://storage.googleapis.com/nackswinget-af7ef.appspot.com/web/uploads/a%20b.png");
  });

  it("never upscales and never repeats widths", () => {
    expect(variantWidthsFor(300)).toEqual([300]);
    expect(variantWidthsFor(1000)).toEqual([480, 960, 1000]);
    expect(variantWidthsFor(2560)).toEqual([480, 960, 1600]);
    expect(variantWidthsFor(undefined)).toEqual([480, 960, 1600]);
  });

  it("builds srcset only when variants exist", () => {
    expect(srcSet("web/uploads/a.pdf", [])).toBeUndefined();
    expect(srcSet("web/uploads/a.png", [480])).toContain("480.webp 480w");
  });
});

describe("banner expiry", () => {
  const b = { text: "x", startAt: "2026-10-10T00:00:00.000Z", days: 6 };
  it("is active from start until start + days", () => {
    expect(bannerExpiresAt(b).toISOString()).toBe("2026-10-16T00:00:00.000Z");
    expect(isBannerActive(b, new Date("2026-10-09T23:59:59Z"))).toBe(false);
    expect(isBannerActive(b, new Date("2026-10-12T12:00:00Z"))).toBe(true);
    expect(isBannerActive(b, new Date("2026-10-16T00:00:00Z"))).toBe(false);
  });
  it("is never active with days = 0", () => {
    expect(isBannerActive({ ...b, days: 0 }, new Date("2026-10-10T00:00:00Z"))).toBe(false);
  });
});
