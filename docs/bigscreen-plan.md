# Storbildsskärm (BigScreen) — plan

Move playlist management for the club room TVs from piSignage (`tkhduracell.pisignage.com`, playlist "Vanliga") to the nackswinget.se admin (`apps/web`). Editors build a playlist on a timeline, as in a video editor. A player page on nackswinget.se plays it, and blocks change on their own. **piSignage stays** as the player on the Pis: its playlist becomes one embedded web link to that page.

Status: 2026-10-29, phases 1, 2 and 4 built on `feat/bigscreen-phase1` and checked locally against the emulators; not merged. Phase 0 (spike on a Pi Zero 2 W) and phase 3 (rollout) are still to do.

## What piSignage does today (playlist "Vanliga")

| # | Asset | Type | Duration | Notes |
|---|---|---|---|---|
| 1 | Nacka Vaermdoeposten Inlaegg 1080p_c.mp4 | video | 59 s | muted |
| 2 | kalender-nackswinget.se.link | Web Link (embedded) | 10 s | `https://nackswinget.se/kalender-for-tv/` |
| 3 | NSW REA 16-9 Film.mp4 | video | 9 s | |
| 4 | Tedans Film.mp4 | video | 5 s | |
| 5 | reklam-nackswinget.se.mrss | Media RSS | 20 s | `https://nackswinget.se/feed/?cat=29` (category "Reklam på TV", slug `reklam`), 2 items, image only |
| 6 | Reklamfilm 16-9.mp4 | video | 11 s | |
| 7 | Bild_16_9_KK.png | image | 5 s | |

Features in use: ordering, a duration per item, mute per video, a text overlay per item ("text message over the image"), web links and Media RSS. Not used: zones/layouts, schedules.

## Goals

| Goal | Target |
|---|---|
| Editor changes visible on the TV | ≤ 60 s after "Publicera" |
| Playback | gapless: no black frames or spinners between blocks |
| Network outage | keeps playing the last playlist from the local cache |
| Hardware | same Raspberry Pi players and piSignage player software, unchanged |
| Sound | none: every video plays muted |
| Screen on/off | handled by the TV's own timer; out of scope |
| Editor UX | build the Vanliga playlist from scratch in < 5 min |

## Decisions

| # | Decision |
|---|---|
| B1 | Everything lives in `apps/web`: admin screen `/admin/storbild/`, player route `/storbild/[key]/` (in `(bare)`), API under `/api/admin/bigscreen/` and `/api/bigscreen/`. No new Cloud Function. |
| B2 | Media come from the existing media library (`media/{id}`, Transcoder renditions). The TV plays the 1080p rendition, and the editor uses the 720p one. A video uploaded once can be used on both the website and the TV. |
| B3 | The timeline holds **blocks**. Block types: `image` and `video` (native media from the library), `latestPosts` ("Senaste N nyheterna"), `calendar`, `page`, `post` and `text`. The last four are full-screen renders of site content (see below). |
| B4 | **Transitions are automatic.** An image or content block moves on when its duration is up. A video moves on when it ends, or when its duration is up if that comes first. The next block is always preloaded, and a fixed 0.6 s crossfade runs between blocks. Editors pick nothing. |
| B5 | The player polls `GET /api/bigscreen/{key}` every 30 s with `If-None-Match`. On a new version it switches **after the current item**, never mid-clip. |
| B6 | Screens are identified by an unguessable `key` in the URL, not a login. The key can be rotated from the admin. |
| B7 | Editors (role `editor`) edit playlists. Creating screens and rotating keys requires the `admin` role. |
| B8 | piSignage stays for good. Its playlist becomes one "Web Link (embedded)" asset that points at `/storbild/{key}/`, with a 24 h duration. No kiosk image and no changes on the Pis. |
| B9 | No sound, ever. Videos always play `muted`, and the editor has no mute toggle. |
| B10 | The "Reklam på TV" category hack goes away. TV ads are uploaded as native `image`/`video` blocks, and the MRSS asset is not carried over. The 2 current ad posts' images are moved to the media library and added as `image` blocks during rollout. |
| B11 | `latestPosts` has two settings: **N** (how many of the newest published posts) and **duration** (seconds per post). Its length on the timeline is N × duration. |
| B12 | The players are **Raspberry Pi Zero 2 W** (512 MB RAM) on 720p/1080p screens. Screens get a **light mode** (on by default for these): the next video isn't preloaded while one plays (images and the calendar still are), two videos in a row fade through black instead of crossfading, and the 720p rendition is used. |
| B14 | The TV runs no React and no frames. `/storbild/{key}/` is a plain HTML page (a route handler) with one stylesheet (`public/storbild/tv.css`) and one ~9 KB script (`public/storbild/player.js`, bundled from `lib/bigscreen/tv.ts` by `scripts/build-storbild.mjs`). Posts, the week calendar and "Dagens schema" come as server-rendered markup in the playlist payload (`lib/bigscreen/render.ts`, `kind: "html"`) and are drawn in the same document. Only `page` blocks still load a site page in an iframe. Reason: the Next.js player plus one Next.js page per block (~600 KB JS each, two or three at once) left the Pi Zero stuck on the logo. |
| B15 | A screen can be set to 4K. Only videos whose source is at least 2160 px tall get a 4K rendition (H.264, 20 Mbit/s), so nothing is upscaled; the browser reads the size before the upload. A video without one plays in 1080p. Videos uploaded before this have no 4K rendition. |
| B13 | Nackswinget only. No multi-club support; Gåsasteget gets a separate off-the-shelf solution. The admin must be usable by non-technical editors: Swedish labels, drag and drop, no settings beyond duration, caption and dates. |

## Data model (Firestore)

```ts
// bigscreenPlaylists/{id}
interface Playlist {
  id: string;
  name: string;              // "Vanliga"
  blocks: Block[];
  version: number;           // bumped on publish; the ETag
  draft?: Block[];           // unpublished edits (same pattern as pages/posts)
  updatedAt: string; updatedBy: string;
}

type Block = {
  id: string;
  durationSec: number;       // video: defaults to the clip length, capped at it; latestPosts: per post
  caption?: string;          // text overlay (replaces piSignage's "text message")
  validFrom?: string;        // ISO date; hidden outside the window (ads for an event)
  validTo?: string;
  disabled?: boolean;
} & (
  | { type: "image"; mediaId: string; fit: "cover" | "contain" }
  | { type: "video"; mediaId: string }                          // always muted (B9)
  | { type: "latestPosts"; count: number }                      // N newest published posts (B11)
  | { type: "calendar"; view: "week" | "day"; feeds: string[] } // replaces kalender-for-tv
  | { type: "page"; pageId: string }                            // any site page, TV layout
  | { type: "post"; postId: string }                            // one pinned news item
  | { type: "text"; title: string; body?: string; background?: string }
);

// bigscreens/{id}
interface Screen {
  id: string;
  name: string;              // "Klubbrummet"
  key: string;               // random 32 chars, in the player URL
  playlistId: string;
  quality: "1080" | "720";   // 720 if the Pi drops frames
  reloadAt?: string;         // bumped by "Ladda om skärmen"
  lastSeenAt?: string;       // heartbeat
  nowPlaying?: string;       // item id
  userAgent?: string; resolution?: string;
}
```

`MediaDoc` gains `durationSec?: number`. The browser reads it from `<video>.duration` when the upload finishes. Existing videos are backfilled the first time they are added to a timeline.

## Content blocks

`latestPosts`, `calendar`, `agenda`, `page` and `post` render site content full screen in a TV layout: large type, no header or footer, no links. All but `page` are rendered to markup on the server and drawn by the player itself (B14); `page` loads `/storbild/sida/` in an iframe. Each is preloaded the same way as a video:
- `latestPosts` ("Senaste N nyheterna"): the N newest published posts, one per screen, each shown for `durationSec`, with an automatic crossfade between them. Each screen shows the featured image on the left and the title and excerpt on the right; a post without an image gets a title-only layout. The list is resolved when the player fetches the playlist, so a new post shows up without anyone editing the playlist.
- `calendar`: this week and next, as on `/kalender-for-tv/`. That route stays until piSignage points at `/storbild/{key}/`, then becomes a redirect.
- `page` / `post`: `PageView` / `PostView` with a `tv` class: hero image on the left, title and text on the right, text clipped to fit.

## Admin: timeline editor (`/admin/storbild/{playlistId}`)

```
┌ Mediabibliotek ─┐ ┌ Förhandsvisning (16:9, plays the timeline) ──────────┐
│ [sök] [filter]  │ │                                                       │
│ ▣ Bild_16_9_KK  │ │                ▶ 00:42 / 02:00                         │
│ ▶ Reklamfilm    │ └───────────────────────────────────────────────────────┘
│ Block:          │ 0s     10s     20s     30s ...                        2:00
│ ＋ Senaste N     │ |▓▓▓▓▓▓ video 59s ▓▓▓▓▓▓|cal 10|rea 9|te|nyheter 3×8|film|kk|
│ ＋ Kalender      │                         ▲ playhead (click/drag to scrub)
│ ＋ Sida/Nyhet    │ [Inspector: duration · N (latestPosts) · caption · from/to dates]
│ ＋ Text          │
└─────────────────┘
```

- The left panel has the media library (drag in to add an `image`/`video` block) and the block palette for the other types. Drag a block to reorder it. Drag a block's right edge to change its length, in 1 s steps; a video can't be made longer than the clip, and a `latestPosts` block resizes its per-post duration (in steps of N seconds). Delete with ✕ or the Delete key.
- A `latestPosts` block is drawn as N segments, labelled "Senaste 3 nyheterna · 8 s/st", so the per-post split is visible.
- Clip width = duration × zoom. Thumbnails come from the image variant or the video poster.
- The inspector shows the selected clip's fields. Clips outside their `validFrom`/`validTo` window are drawn striped.
- The preview is the **same player component** as on the TV, fed the draft, so what you see is what the TV shows.
- Draft/publish works as in the page editor (`useDraft`), with versions and an audit entry.
- Drag and drop: `@dnd-kit/core` + `@dnd-kit/sortable`, which also gives keyboard reordering. The resize handle is plain pointer events.
- The playlist list shows each screen's status: online (heartbeat < 2 min), what it is playing now, and a "Ladda om skärmen" button that bumps `reloadAt`.

## Player (`/storbild/[key]/`)

- Two stacked layers (A/B). The next item loads into the hidden layer while the current one plays, then the layers crossfade (B4).
- Videos use `<video muted playsinline preload="auto">`. Muted autoplay needs no user gesture, so it works inside piSignage's embedded web link.
- piSignage may reload the web link when its asset duration runs out or the Pi restarts. The player saves its position (item id and offset) in `localStorage` and continues from there, so a reload doesn't restart the loop from item 1.
- Offline: a service worker puts every media URL in the playlist into Cache Storage, answers byte-range requests from it (videos need them), and keeps the last playlist JSON. The media objects are immutable, so the cache only drops entries the playlist no longer uses.
- Error handling: a clip that fails to load is skipped, the failure goes in the heartbeat, and the player moves on. An empty or invalid playlist shows the club logo.
- Heartbeat: `POST /api/bigscreen/{key}/heartbeat` every 60 s with `{ nowPlaying, version, errors }`.
- The player reloads itself every night at 04:00 to clear memory leaks on the Pi.

## piSignage setup (done once, by hand)

1. Create a "Web Link (embedded)" asset `storbild-nackswinget.se` → `https://nackswinget.se/storbild/{key}/`.
2. Make it the only item in "Vanliga" with a duration of 86400 s, and remove the other 7 assets from the playlist.
3. Leave the group, schedule and player settings as they are.

Videos now play in the browser inside piSignage's web link, not in piSignage's own video player. The Pi Zero 2 W decodes H.264 up to 1080p in hardware, but 512 MB RAM is tight for a browser, hence light mode (B12). If the spike shows that even 720p stutters, the fallback is to keep videos as native piSignage assets and use the web link only for the calendar and news.

## Phases and done criteria

| Phase | Scope | Done when |
|---|---|---|
| 0. Spike | A static page with one of today's clips, loaded as a web link in piSignage. Built 2026-10-29: `https://storage.googleapis.com/nackswinget-af7ef.appspot.com/web/spike/storbild/index.html` (`?q=1080\|720\|src`, `?debug=0`, `?reset=1`) | 1080p plays smoothly on the Pi, or we know 720p is needed |
| 1. Model + player | Zod schemas, Firestore rules, `/api/bigscreen/{key}`, the player with preloading and crossfade, the `calendar` block renderer, a seed playlist (`pnpm bigscreen:seed`). Built 2026-10-29 on `feat/bigscreen-phase1`: block types `image`, `video`, `calendar` | The Vanliga playlist loops on desktop Chrome at 1920×1080 with no gaps |
| 2. Admin | Screens and playlists lists, timeline editor, inspector, preview, draft/publish, audit, `durationSec` on media | An editor rebuilds Vanliga in the admin in < 5 min, and a publish reaches the player in ≤ 60 s |
| 3. Rollout | piSignage setup (above), heartbeat/status in the admin, resume after reload | The club room TV has run 48 h on the new player with no gaps or freezes |
| 4. More blocks | `latestPosts`, `page`, `post`, `text`, the validFrom/validTo filter, offline service worker | A newly published post shows on the TV without anyone editing the playlist, and unplugging the network for 10 min doesn't stop playback |

WordPress cutover: `https://nackswinget.se/feed/?cat=29` and `/kalender-for-tv/` must keep working until piSignage points at `/storbild/{key}/`. Either do phase 3 before the DNS switch, or keep both URLs working on the new site.

## CI/CD

- No new deploy target. `web-deploy.yaml` already deploys `apps/web`, and `reviews.yaml` runs typecheck, unit and e2e.
- `firestore.rules`: the `bigscreen*` collections are server-only (Admin SDK), like `media/`.
- Nothing is deployed to the Pis: piSignage only stores the URL.

## Test plan

**Local (each PR):**
- Unit tests (vitest):
  - resolving the playlist: blocks outside `validFrom`/`validTo` are left out (injected clock)
  - duration rules: a video is capped at its clip length; a `latestPosts` block lasts N × duration, or less when fewer than N posts exist
  - the ETag/version handshake
  - resume: a saved position for an item that was removed falls back to the next item
- Playwright tests (emulators + seed playlist):
  - The player moves on by itself through image → video → calendar, with the crossfade between blocks.
  - Publishing a reordered playlist switches the player after the current item.
  - Reloading the player continues from the saved item.
  - Admin: drag to reorder, resize a clip from 5 s to 12 s, publish. The API returns the new order and durations.
  - An unknown key returns 404, and a rotated key stops the old URL.
- Edge cases:
  - a video still `processing` (skipped, and the editor shows a warning)
  - a deleted media item in a playlist
  - a playlist of a single image (loops without flashing)
  - a 0-item playlist (shows the logo)
  - an iframe page that fails to load
  - a `latestPosts` block when no posts are published (the block is skipped)
  - a post without a featured image
  - Swedish characters in captions

**Post-merge E2E (prod):**
- Open `/storbild/{key}/` on a laptop next to the TV and check that it matches the admin preview.
- Phase 3: switch the piSignage playlist to the web link and watch one full loop on the TV: no black frames, no sound. The admin shows the screen as online with the right `nowPlaying`.
- Restart the Pi mid-loop. The player continues from the saved item, not item 1.
- Change one duration in the admin. The TV picks it up within 60 s.
- After phase 4: publish a news post, and it shows on the TV within 60 s in the `latestPosts` block. Pull the TV's network cable for 10 min, and playback continues.

## Open questions

1. Does the spike page play smoothly on a Pi Zero 2 W in piSignage's web link, at `?q=720` and `?q=1080`?
2. How many screens are there? Only the club room?

Answered 2026-10-29:
- piSignage stays as the player (B8).
- No sound (B9).
- The TV's own timer turns the screen on and off.
- The MRSS asset is the "Reklam på TV" category feed. It is not carried over; ads become native media blocks (B10).
- A "Senaste N nyheterna" block with settings for N and duration (B11).
