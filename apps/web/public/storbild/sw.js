// Storbild offline cache (docs/bigscreen-plan.md, phase 4). Scope: /storbild/.
// Registered by the TV player (lib/bigscreen/tv.ts), except on localhost.
//
// - Player page, player.js and tv.css (/storbild/...): network first, the last good copy when offline.
// - Next's static assets: cache first (their names change with every build).
// - Media in Cloud Storage: cache first, answering byte-range requests from the
//   cached file, so videos keep playing without a network. A file is fetched
//   whole in the background the first time it plays. The page tells us which
//   files the playlist still uses ("keep"), and the rest is deleted.
// The playlist itself is kept by the player (localStorage), not here.

const PAGES = "storbild-pages-v1";
const STATIC = "storbild-static-v1";
const MEDIA = "storbild-media-v1";
const MEDIA_PREFIX = "https://storage.googleapis.com/nackswinget-af7ef.appspot.com/web/";
const NETWORK_TIMEOUT_MS = 5000;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [PAGES, STATIC, MEDIA];
      for (const name of await caches.keys()) if (name.startsWith("storbild-") && !keep.includes(name)) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

// One warm-up at a time: a new "keep" queues behind the running one, and each
// file is checked against the cache right before it's fetched, so nothing is
// downloaded twice (the Pi Zero's Wi-Fi is the bottleneck).
let warming = Promise.resolve();

self.addEventListener("message", (event) => {
  if (event.data?.type !== "keep" || !Array.isArray(event.data.urls)) return;
  const wanted = new Set(event.data.urls);
  warming = warming.then(async () => {
    const cache = await caches.open(MEDIA);
    for (const req of await cache.keys()) if (!wanted.has(req.url)) await cache.delete(req);
    for (const url of wanted) if (!(await cache.match(url))) await fetchWhole(cache, url);
  });
  event.waitUntil(warming);
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.url.startsWith(MEDIA_PREFIX)) return event.respondWith(media(req));
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/")) return event.respondWith(cacheFirst(STATIC, req));
  if (url.pathname.startsWith("/storbild/") && !url.pathname.endsWith("/sw.js")) return event.respondWith(networkFirst(PAGES, req));
});

async function networkFirst(name, req) {
  const cache = await caches.open(name);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS))]);
    if (res.ok) await cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(name, req) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

/** Fetches a media file whole (CORS, so the bytes are readable) and stores it. */
async function fetchWhole(cache, url) {
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok || res.status !== 200 || res.type !== "cors") return;
    // A 4K file can be larger than the browser's quota: don't download what can't be kept.
    const { quota = Infinity, usage = 0 } = (await navigator.storage?.estimate?.()) ?? {};
    if (Number(res.headers.get("content-length")) > quota - usage) {
      await res.body?.cancel();
      return reportCacheError(url);
    }
    await cache.put(url, res);
  } catch (e) {
    // Otherwise offline or no CORS for this origin: the file is just not cached.
    if (e?.name === "QuotaExceededError") await reportCacheError(url);
  }
}

/** The player passes this on with its heartbeat, as the file then always plays from the network. */
async function reportCacheError(url) {
  for (const client of await self.clients.matchAll({ type: "window" })) client.postMessage({ type: "cache-error", url });
}

async function media(req) {
  const cache = await caches.open(MEDIA);
  const hit = await cache.match(req.url);
  // Not cached yet: straight from the network. The warm-up ("keep") fetches it whole.
  if (!hit) return fetch(req);
  const range = req.headers.get("range");
  if (!range) return hit;
  // Blob slices are backed by the cache on disk, so this doesn't load the whole video into memory.
  const blob = await hit.blob();
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? Number(m[1]) : 0;
  let end = m && m[2] ? Number(m[2]) : blob.size - 1;
  if (m && !m[1] && m[2]) {
    start = Math.max(0, blob.size - Number(m[2]));
    end = blob.size - 1;
  }
  if (start >= blob.size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${blob.size}` } });
  end = Math.min(end, blob.size - 1);
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": hit.headers.get("Content-Type") || "video/mp4",
      "Content-Range": `bytes ${start}-${end}/${blob.size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}
