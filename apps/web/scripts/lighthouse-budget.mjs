// Lighthouse budget check (plan Q2/Q23): median of 3 runs per URL.
// Fails if desktop FCP/SI > 1.0 s or mobile FCP/SI > 1.5 s.
//   pnpm lighthouse:budget [--base http://localhost:3200] [paths...]
// Plain JS on purpose: tsx/esbuild injects helpers into functions that
// Lighthouse serializes into the page, which breaks them.

import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const base = baseIdx >= 0 ? args[baseIdx + 1] : "http://localhost:3200";
const paths = args.filter((a, i) => !a.startsWith("--") && i !== baseIdx + 1);
const urls = (paths.length ? paths : ["/", "/kalender/", "/testnyhet-1/"]).map((p) => new URL(p, base).toString());
const BUDGET = { desktop: 1000, mobile: 1500 };
const RUNS = 3;

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function main() {
  const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new", "--no-sandbox"] });
  let failed = false;
  try {
    for (const url of urls) {
      for (const formFactor of ["mobile", "desktop"]) {
        const fcp = [];
        const si = [];
        for (let i = 0; i < RUNS; i++) {
          const result = await lighthouse(
            url,
            { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance"] },
            formFactor === "desktop"
              ? { extends: "lighthouse:default", settings: { formFactor: "desktop", screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }, throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 } } }
              : undefined,
          );
          const audits = result.lhr.audits;
          fcp.push(audits["first-contentful-paint"].numericValue);
          si.push(audits["speed-index"].numericValue);
        }
        const f = median(fcp);
        const s = median(si);
        const ok = f <= BUDGET[formFactor] && s <= BUDGET[formFactor];
        failed ||= !ok;
        console.log(`${ok ? "ok  " : "FAIL"} ${formFactor.padEnd(7)} FCP ${Math.round(f)} ms  SI ${Math.round(s)} ms  (budget ${BUDGET[formFactor]} ms)  ${url}`);
      }
    }
  } finally {
    chrome.kill();
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
