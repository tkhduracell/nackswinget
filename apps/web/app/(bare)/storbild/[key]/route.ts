import { LOGO_URL } from "@/components/admin/brand";
import { esc } from "@/lib/bigscreen/render";
import { getScreenByKey } from "@/lib/bigscreen/store";

// The TV player. piSignage shows this page as a web link; the key in the URL
// identifies the screen (docs/bigscreen-plan.md). A plain page with one small
// script (public/storbild/player.js, from lib/bigscreen/tv.ts) and one
// stylesheet: no React, no Next.js runtime, no frames, so a Pi Zero 2 W
// (512 MB) has a single light document to run.
export async function GET(_req: Request, { params }: RouteContext<"/storbild/[key]">) {
  const { key } = await params;
  if (!(await getScreenByKey(key))) return new Response("Okänd skärm", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  // notranslate: the TVs run Chromium in English and would offer to translate the Swedish text.
  const html = `<!doctype html>
<html lang="sv" translate="no">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="google" content="notranslate">
<meta name="robots" content="noindex, nofollow">
<title>Storbild</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden;cursor:none}</style>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap">
<link rel="stylesheet" href="/storbild/tv.css">
</head>
<body>
<main class="bs-screen"><div class="bs-stage" id="bs-stage" data-key="${esc(key)}"><div class="bs-idle" aria-hidden="true"><img class="bs-logo" src="${esc(LOGO_URL)}" alt=""></div></div></main>
<script src="/storbild/player.js" defer></script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
