// Uploads content/snapshot.json to a deployed site's import endpoints, then
// asks the server to copy every WordPress upload into Cloud Storage. The
// server does the Firestore/Storage writes with its own service account, so
// no Google credentials are needed here, only the IMPORT_TOKEN.
//
//   pnpm import --url https://nsw-web--nackswinget-af7ef.europe-west4.hosted.app
//   pnpm import --url ... --skip-media | --only-media

import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const base = (arg("--url") ?? "http://localhost:3100").replace(/\/$/, "");
const file = arg("--file") ?? "content/snapshot.json";
const tokenFile = arg("--token-file") ?? path.join(os.homedir(), ".config", "nsw", "import-token");
const skipMedia = process.argv.includes("--skip-media");
const onlyMedia = process.argv.includes("--only-media");

async function post(route: string, body: unknown, token: string) {
  const res = await fetch(`${base}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-import-token": token },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${route} ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function main() {
  const token = (await readFile(tokenFile, "utf8")).trim();
  const snapshot = JSON.parse(await readFile(file, "utf8")) as { media: string[] };

  if (!onlyMedia) {
    console.log(`Writing content to ${base} ...`);
    console.log(await post("/api/import/content", snapshot, token));
  }
  if (skipMedia) return;

  type Result = { path: string; ok: boolean; skipped?: boolean; status?: number; error?: string };
  const failed: string[] = [];
  let skipped = 0;
  // Retries a batch on 5xx by splitting it, down to single files.
  async function copy(paths: string[], attempt = 0): Promise<void> {
    try {
      const { results } = (await post("/api/import/media", { paths }, token)) as { results: Result[] };
      for (const r of results) {
        if (r.skipped) skipped++;
        if (!r.ok) failed.push(`${r.path} (${r.status ?? r.error})`);
      }
    } catch (e) {
      if (attempt >= 3) {
        failed.push(...paths.map((p) => `${p} (${(e as Error).message.slice(0, 80)})`));
        return;
      }
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      if (paths.length === 1) return copy(paths, attempt + 1);
      const mid = Math.ceil(paths.length / 2);
      await copy(paths.slice(0, mid), attempt + 1);
      await copy(paths.slice(mid), attempt + 1);
    }
  }
  const batch = 10;
  for (let i = 0; i < snapshot.media.length; i += batch) {
    await copy(snapshot.media.slice(i, i + batch));
    console.log(`media ${Math.min(i + batch, snapshot.media.length)}/${snapshot.media.length}, skipped ${skipped}, failed ${failed.length}`);
  }
  if (failed.length) console.log(`Failed:\n  ${failed.join("\n  ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
