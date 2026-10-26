// Fills empty or weak image alt texts and meta descriptions with Claude, with a
// human review step in between. Nothing reaches the site until `apply`.
//
//   pnpm seo:fill suggest --url https://nackswinget.se [--only alt|description] [--limit 20]
//     -> content/seo-suggestions.json: edit a "suggestion", or set "approved": false
//   pnpm seo:fill apply --url https://nackswinget.se [--dry-run]
//     -> writes approved suggestions; fields an editor changed since are skipped
//
// Needs ANTHROPIC_API_KEY (or an `ant auth login` profile) for `suggest`, and the
// IMPORT_TOKEN in $NSW_IMPORT_TOKEN or ~/.config/nsw/import-token (or --token-file) for both steps.
// `suggest` resumes: gaps already in the output file are not sent again.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { type Gap, gapKey } from "../lib/seo-fill";

const MODEL = "claude-opus-5-5";
const CONCURRENCY = 4;

const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const command = process.argv[2];
const base = (arg("--url") ?? "http://localhost:3100").replace(/\/$/, "");
const file = arg("--file") ?? "content/seo-suggestions.json";
const tokenFile = arg("--token-file") ?? path.join(os.homedir(), ".config", "nsw", "import-token");
const only = arg("--only") as Gap["field"] | undefined;
const limit = Number(arg("--limit") ?? Infinity);
const dryRun = process.argv.includes("--dry-run");

type Entry = Gap & { suggestion: string; approved: boolean; note?: string };

const SYSTEM = `You write SEO metadata for the website of Dansklubben Nackswinget, a dance club in Nacka, Stockholm (bugg, fox, socialdans, courses and competitions). All output is in Swedish.

Image alt text:
- Describe what the image shows that matters on this page: people dancing, an event poster, a logo, a venue. Read any visible text that carries meaning (event name, date).
- One sentence, at most 125 characters. Do not start with "Bild på", "Foto av" or similar.
- Do not guess names of people or facts that are not visible or in the page context.
- If the image is purely decorative (a texture, divider or background), set decorative to true and alt to "".

Meta description:
- 120 to 155 characters, a natural sentence or two that tells a searcher what the page offers.
- Only use facts from the page text. No invented dates, prices or claims, no keyword stuffing, no quotation marks.
- Mention Nackswinget where it reads naturally.`;

const AltSchema = z.object({ alt: z.string(), decorative: z.boolean() });
const DescriptionSchema = z.object({ description: z.string() });

async function token() {
  return process.env.NSW_IMPORT_TOKEN?.trim() || (await readFile(tokenFile, "utf8")).trim();
}

async function readEntries(): Promise<Entry[]> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Entry[];
  } catch {
    return [];
  }
}

async function suggestOne(client: Anthropic, gap: Gap): Promise<{ suggestion: string; note?: string }> {
  const page = `Sida: ${gap.title} (${gap.url})\n\nSidans text:\n${gap.context || "(ingen text)"}`;
  const common = {
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    // A short, well-specified task: low effort is enough.
    output_config: { effort: "low" as const },
    // On a safety decline, rerun on the recommended fallback model instead of failing.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const,
  };
  if (gap.field === "alt") {
    const res = await client.beta.messages.parse({
      ...common,
      output_config: { ...common.output_config, format: betaZodOutputFormat(AltSchema) },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: gap.imageUrl } },
            { type: "text", text: `Write the alt text for this image.\n\n${page}` },
          ],
        },
      ],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return { suggestion: "", note: `no answer (${res.stop_reason})` };
    const { alt, decorative } = res.parsed_output;
    return decorative ? { suggestion: "", note: "model: decorative, leave alt empty" } : { suggestion: alt.trim() };
  }
  const res = await client.beta.messages.parse({
    ...common,
    output_config: { ...common.output_config, format: betaZodOutputFormat(DescriptionSchema) },
    messages: [{ role: "user", content: `Write the meta description for this page.\n\n${page}` }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) return { suggestion: "", note: `no answer (${res.stop_reason})` };
  const description = res.parsed_output.description.trim();
  return { suggestion: description, ...(description.length > 160 ? { note: `${description.length} chars, will be cut at 160` } : {}) };
}

async function suggest() {
  const res = await fetch(`${base}/api/import/seo/`, { headers: { "x-import-token": await token() } });
  if (!res.ok) throw new Error(`GET /api/import/seo/ ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const { gaps, skippedWithDraft } = (await res.json()) as { gaps: Gap[]; skippedWithDraft: string[] };
  const entries = await readEntries();
  const done = new Set(entries.map(gapKey));
  const todo = gaps.filter((g) => (!only || g.field === only) && !done.has(gapKey(g))).slice(0, limit);
  console.log(`${gaps.length} gaps (${gaps.filter((g) => g.field === "alt").length} alt, ${gaps.filter((g) => g.field === "description").length} description); ${todo.length} to suggest now.`);
  if (skippedWithDraft.length) console.log(`Skipped, open draft in admin: ${skippedWithDraft.join(", ")}`);

  const client = new Anthropic();
  let next = 0;
  let failed = 0;
  const worker = async () => {
    while (next < todo.length) {
      const gap = todo[next++];
      try {
        const { suggestion, note } = await suggestOne(client, gap);
        entries.push({ ...gap, suggestion, approved: suggestion !== "", ...(note ? { note } : {}) });
        console.log(`${gap.field.padEnd(11)} ${gap.url} ${suggestion ? `-> ${suggestion}` : `(${note})`}`);
      } catch (e) {
        failed++;
        console.error(`FAILED ${gapKey(gap)}: ${e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : (e as Error).message}`);
      }
      // Saved after every answer so an interrupted run loses nothing.
      await writeFile(file, `${JSON.stringify(entries, null, 2)}\n`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`\nWrote ${file}. ${failed ? `${failed} failed (re-run to retry). ` : ""}Review it, then run: pnpm seo:fill apply --url ${base}`);
}

async function apply() {
  const entries = await readEntries();
  const items = entries
    .filter((e) => e.approved && e.suggestion.trim())
    .map((e) => ({ kind: e.kind, id: e.id, field: e.field, current: e.current, value: e.suggestion.trim(), ...(e.field === "alt" ? { path: e.path, src: e.src } : {}) }));
  console.log(`${items.length} approved of ${entries.length} suggestions.`);
  if (dryRun || items.length === 0) return;
  const res = await fetch(`${base}/api/import/seo/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-import-token": await token() },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(`POST /api/import/seo/ ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const { results } = (await res.json()) as { results: { kind: string; id: string; field: string; result: string }[] };
  const counts = results.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.result]: (acc[r.result] ?? 0) + 1 }), {});
  console.log(counts);
  for (const r of results.filter((r) => r.result !== "applied")) console.log(`  ${r.result.padEnd(9)} ${r.kind}/${r.id} ${r.field}`);
}

async function main() {
  if (command === "suggest") await suggest();
  else if (command === "apply") await apply();
  else {
    console.error("usage: pnpm seo:fill suggest|apply --url <site> [--file content/seo-suggestions.json]");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
