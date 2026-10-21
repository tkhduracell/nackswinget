// HTTP smoke check of a deployed nackswinget.se (preview or production).
// No browser, no credentials: status codes, redirects, content markers.
//   pnpm smoke [--base https://nsw-web--nackswinget-af7ef.europe-west4.hosted.app]

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const BASE = (baseIdx >= 0 ? args[baseIdx + 1] : "https://nsw-web--nackswinget-af7ef.europe-west4.hosted.app").replace(/\/$/, "");
const STORAGE = "https://storage.googleapis.com/nackswinget-af7ef.appspot.com/";

/** [path, expected status, check(body, res) -> error string | null] */
const CHECKS = [
  ["/", 200, (b) => (b.includes("Dansklubben Nackswinget") ? null : "missing site name")],
  ["/", 200, (b) => (/<script type="application\/ld\+json">[^<]*SportsClub/.test(b) ? null : "missing SportsClub JSON-LD")],
  ["/", 200, (b) => (b.includes('property="og:title"') ? null : "missing Open Graph tags")],
  ["/kalender/", 200, (b) => (b.includes("data-cal-month") ? null : "missing month picker")],
  ["/kalender/", 200, (b) => (/class="ev"/.test(b) ? null : "no calendar events rendered")],
  ["/kontakt/", 200, (b) => (b.includes("google.com/maps") ? null : "missing map embed")],
  ["/om-oss/antidoping/", 200, (b) => (b.includes("breadcrumbs") ? null : "missing breadcrumbs")],
  ["/nyheter/", 200, (b) => (b.includes("post-card") ? null : "no posts listed")],
  ["/nyheter/sida/2/", 200, null],
  ["/category/kurs/", 200, null],
  ["/kalender-for-tv/", 200, (b) => (b.includes("cal-week") ? null : "missing week view")],
  ["/finns-inte-xyz/", 404, null],
  ["/hem-2/", 308, (_b, r) => (new URL(r.headers.get("location") ?? "", BASE).pathname === "/" ? null : "should redirect to /")],
  ["/boka/", 308, (_b, r) => ((r.headers.get("location") ?? "").includes("calendars-api/book") ? null : "should redirect to booking")],
  ["/tag/tavling/", 308, null],
  ["/kalender", 308, null],
  ["/wp-content/uploads/2022/10/favicon.png", 308, (_b, r) => ((r.headers.get("location") ?? "").startsWith(STORAGE) ? null : "should redirect to Storage")],
  ["/feed/", 200, (b) => (b.includes("<rss") && b.includes("media:thumbnail") ? null : "RSS missing items/thumbnails")],
  ["/feed/?cat=-5", 200, (b) => (b.includes("<item>") ? null : "filtered RSS empty")],
  ["/sitemap.xml", 200, (b) => (b.includes("<urlset") ? null : "not a sitemap")],
  ["/robots.txt", 200, null],
  ["/llms.txt", 200, (b) => (b.startsWith("# ") ? null : "not markdown")],
  ["/md/index.md", 200, null],
  ["/search.json", 200, (b) => (JSON.parse(b).length > 100 ? null : "search index too small")],
  ["/og/?title=Smoke", 200, (_b, r) => ((r.headers.get("content-type") ?? "").startsWith("image/") ? null : "not an image")],
  ["/admin/", 200, null],
  ["/api/admin/me/", 401, null],
  ["/api/cron/", 405, null],
];

async function run() {
  const failures = [];
  const started = Date.now();
  for (const [path, status, check] of CHECKS) {
    let line;
    try {
      const res = await fetch(BASE + path, { redirect: "manual", headers: { "User-Agent": "nsw-smoke/1.0" } });
      const body = status === 200 ? await res.text() : "";
      const err = res.status !== status ? `status ${res.status}, expected ${status}` : check ? check(body, res) : null;
      line = `${err ? "FAIL" : "ok  "} ${String(res.status).padEnd(3)} ${path}${err ? `  — ${err}` : ""}`;
      if (err) failures.push(`${path}: ${err}`);
    } catch (e) {
      line = `FAIL ERR ${path}  — ${e.message}`;
      failures.push(`${path}: ${e.message}`);
    }
    console.log(line);
  }
  // Images referenced by the start page must resolve (variants exist).
  const home = await (await fetch(`${BASE}/`)).text();
  const imgs = [...new Set([...home.matchAll(/https:\/\/storage\.googleapis\.com\/[^"'\s)]+\.webp/g)].map((m) => m[0]))].slice(0, 10);
  for (const url of imgs) {
    const res = await fetch(url, { method: "HEAD" });
    const err = res.ok ? null : `status ${res.status}`;
    console.log(`${err ? "FAIL" : "ok  "} ${res.status} ${url.slice(STORAGE.length)}`);
    if (err) failures.push(`${url}: ${err}`);
  }
  console.log(`\n${CHECKS.length + imgs.length - failures.length}/${CHECKS.length + imgs.length} passed in ${((Date.now() - started) / 1000).toFixed(1)} s against ${BASE}`);
  if (failures.length) {
    console.log(`\nFailures:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
