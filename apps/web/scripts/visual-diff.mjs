// Screenshots the same paths on the old WordPress site and the new site, side by side,
// to compare the look page by page.
//   node scripts/visual-diff.mjs [--out dir] [--new <url>] [path ...]
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const [, value] = args.splice(i, 2);
  return value;
};
const OUT = opt("--out", "visual-diff");
const OLD = opt("--old", "https://nackswinget.se");
const NEW = opt("--new", "https://nsw-web--nackswinget-af7ef.europe-west4.hosted.app");
const PATHS = args.length ? args : ["/", "/kalender/", "/kurser/", "/om-oss/", "/kontakt/", "/nyheter/", "/om-oss/antidoping/"];
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: vp === "mobile" });
  const page = await ctx.newPage();
  for (const path of PATHS) {
    const slug = path.replace(/^\/|\/$/g, "").replace(/\//g, "_") || "home";
    for (const [site, base] of [["old", OLD], ["new", NEW]]) {
      try {
        await page.goto(base + path, { waitUntil: "networkidle", timeout: 45_000 });
        // Cookie banners and lazy images: scroll through once, then back to the top.
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 600) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 60));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/${slug}.${vp}.${site}.png`, fullPage: true });
        console.log(`ok   ${vp} ${site} ${path}`);
      } catch (e) {
        console.log(`FAIL ${vp} ${site} ${path}: ${e.message.split("\n")[0]}`);
      }
    }
  }
  await ctx.close();
}
await browser.close();
