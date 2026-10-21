# nackswinget.se rebuild — plan

Replace the WordPress/Divi site at nackswinget.se with a Next.js app in this monorepo (`apps/web`), backed by the existing Firebase project `nackswinget-af7ef`. Content lives in Firestore, media in Cloud Storage, and editors work in an admin UI with live preview.

Status: plan agreed 2026-10-21. Nothing built yet.

## Goals and budgets

| Goal | Target |
|---|---|
| First Contentful Paint | ≤ 1.0 s (Lighthouse desktop **and** mobile) |
| Speed Index | ≤ 1.0 s (same) |
| CI hard fail | desktop > 1.0 s, or mobile > 1.5 s |
| Calendar freshness | ≤ 5 min behind the ICS files |
| Publish → live | ≤ 10 s (on-demand revalidation) |
| Accessibility | no axe violations, serious or worse |

Ways to stay under budget:
- Pages are static HTML from the CDN, with critical CSS inlined.
- Open Sans is self-hosted, subset to Latin, two weights (about 30 KB, `font-display: swap`).
- No third-party scripts before load. Cloudflare Web Analytics loads after load; dans.se widgets and YouTube load when scrolled into view or clicked.
- Images use responsive WebP `srcset` with a blurred placeholder.
- Admin code is a separate client-only bundle under `/admin` and never ships on public pages.

## Decisions (from the grilling session)

| # | Decision |
|---|---|
| Q1 | Next.js (App Router) on **Firebase App Hosting**. Pages are statically rendered, and on-demand revalidation runs on publish. |
| Q2 | Budgets as in the table above. **Lighthouse CI** runs on every PR. |
| Q3 | Firebase Auth with email link + Google sign-in. A Firestore allowlist controls access, and custom claims carry the role: `admin` or `editor`. |
| Q4 | The rich text editor is **TipTap** with a locked schema: paragraph, H2/H3, bold, italic, link, ul/ol, blockquote, image, video, button, simple table. Editors cannot set font, size or colour. Pasted text is sanitised. Content is stored as ProseMirror JSON and rendered on the server. |
| Q5 | Pages are a list of sections from a **small fixed set** (see Q24). No free-form layout. |
| Q6 | Import **all 236 posts** and keep their URLs (`/<slug>/`). |
| Q7 | Images upload to Storage, max 20 MB. Resized WebP variants at 480/960/1600 w, plus a focal-point picker. Originals are never served. |
| Q8 | Videos have **no upload cap** (resumable upload). A Cloud Run ffmpeg job transcodes each upload to H.264 MP4 at 1080p + 720p, plus a poster image. The original goes to Archive class storage. YouTube embeds show a thumbnail and load the player on click. |
| Q9 | **Star banner ("Joy's PowerPuff")**: text (≤ 80 chars), optional link, start date, and "visible for N days". It hides itself when expired, and one next banner can be scheduled. Colours are fixed. |
| Q10 | Live preview shows a split pane of the real components rendered from the draft, with a mobile/desktop toggle. Drafts save automatically, Publish triggers revalidation, and the last 20 versions are kept for rollback. |
| Q11 | SEO: title, description and canonical; OG + Twitter tags with auto-generated OG images; JSON-LD for `SportsClub`, `NewsArticle`, `Event` and `BreadcrumbList`. Also `sitemap.xml`, `robots.txt`, RSS at `/feed/`, and `llms.txt` plus a `.md` twin of each page. |
| Q12 | Blaze plan with a **100 kr/month budget alert**. Email stays at Miss Hosting, and only the web DNS records move. WP stays live until cutover, then stays read-only for 30 days. |
| Q13 | Code lives in this monorepo as `apps/web`. |
| Q14 | `/feed/` stays compatible with today's RSS (Mailchimp uses it). `news-api` moves to reading Firestore directly. |
| Q15 | The calendar reads the existing ICS files in GCS on the server, with `revalidate: 300`. There is no new pipeline. |
| Q16 | App Hosting region **europe-west4**. Check that it's offered when setting up. |
| Q17 | The admin lives at `/admin` in the same app, client-only, `noindex`, and lazy-loaded. |
| Q18 | Staging is a second App Hosting backend built from the `staging` branch. It uses the named Firestore DB `staging` and the Storage prefix `staging/`, in the same project. |
| Q19 | Analytics: Cloudflare Web Analytics. It sets no cookies, so no cookie banner is needed. |
| Q20 | Site search uses a static index rebuilt on publish (MiniSearch JSON). The index is only fetched when search is opened. |
| Q21 | Posts can be scheduled, and a "Send push to the app" checkbox triggers `notifications-api`. |
| Q22 | Daily Firestore export kept 30 days, Storage object versioning, an audit log, and soft delete with a 30-day media trash. |
| Q23 | CI runs typecheck, unit tests, Playwright smoke tests, Lighthouse CI budgets and axe in GitHub Actions. |
| Q24 | Section types are listed in the Q24 section below. |
| Q25 | dans.se widgets load lazily when scrolled into view, with a fallback link until then. |
| Q26 | `boka` becomes a managed redirect. The push UI on `medlemstraning-2` becomes a React section. `kalender-for-tv` becomes a headerless week view that auto-refreshes every 5 min. Old event pages are migrated as they are. |
| Q27 | All media and PDFs are imported, with permanent redirects for `/wp-content/uploads/*`. Category URLs keep working, tags redirect to categories, and a broken-link report is produced for manual fixing. |
| Q28 | Post layout has a sidebar (latest posts, "På gång") on desktop that moves below the post on mobile. The IdrottOnline login link is dropped. Posts without an image get a generated OG image (logo + title). |
| Q29 | On mobile the calendar month grid becomes a list of days. The month dropdown keeps its new flat style. Feed colours and names are set in the admin. |
| Q31 | Brand refresh: same red `#F9064B`, black header and Open Sans, with a strict type/spacing scale and a sticky mobile header. |
| Q32 | Menu editor (admins only): drag and drop, two levels, pages or external URLs. |
| Q33 | Footer content, editable in settings: contact, social links, quick links, "Ren idrott" badge. |
| Q34 | Work happens in the phases below. WP stays live until phase 6. |

## Architecture

```
apps/web (Next.js, App Hosting europe-west4)
 ├─ app/(site)/…           public routes, static, revalidateTag on publish
 ├─ app/admin/…            client-only admin (TipTap, preview, media)
 ├─ app/api/revalidate     called by the publish action (auth: ID token + role)
 ├─ app/feed/route.ts      RSS (WP-compatible)
 ├─ app/sitemap.ts, robots.ts, llms.txt/route.ts, [slug].md/route.ts
 └─ lib/{firestore,render,sections,calendar,seo,images}

functions/ (existing, gen2, europe-north1)
 ├─ calendars-*-api        unchanged (writes cal_<id>.ics every 5 min)
 ├─ competitions-api       unchanged (dans.se_competitions_all.ics)
 ├─ news-api               → reads Firestore posts instead of WP RSS
 ├─ notifications-api      unchanged (+ called from "Send push")
 ├─ media-api (new)        Storage finalize trigger → image variants
 └─ video-transcode (new)  Cloud Run job, ffmpeg → 1080p/720p MP4 + poster

Firestore (default DB = prod, "staging" DB)
Storage: media/, archive/ (Archive class), cal_*.ics (existing)
```

Rendering and caching:
- Public pages are statically generated and cached on the CDN with tags (`page:<id>`, `post:<id>`, `nav`, `settings`, `banner`).
- Publish writes the published doc, then calls `/api/revalidate` with the affected tags.
- The star banner expires on the client: the HTML carries `expiresAt`, and a 200-byte inline script hides the banner after that time. A daily revalidation removes it from the HTML.
- The calendar section fetches the ICS files on the server with `next: { revalidate: 300 }`, parses them (`node-ical`), and renders HTML. Month navigation uses prerendered month fragments, so no client fetch is needed for the current ±2 months.

## Data model (Firestore)

```
pages/{id}        slug, parentId, title, sections[], seo{title,description,image},
                  status(draft|published), publishedAt, updatedBy, updatedAt
pages/{id}/versions/{n}   snapshot (keep 20)
pages/{id}/draft          working copy (autosave)
posts/{id}        slug, title, excerpt, body(PM JSON), category, image, publishAt,
                  status, legacyId, seo{…}, pushSent
posts/{id}/versions/{n}
media/{id}        kind(image|video|file), path, variants{480,960,1600}|renditions{720,1080,poster},
                  focal{x,y}, alt, width, height, size, status(processing|ready|error), deletedAt
nav/main          items[{label, pageId|url, children[]}]
settings/site     name, logo, footer{…}, social{…}, calendarFeeds[{key,name,color,url}],
                  analytics, defaultOgImage
banners/{id}      text, url, startAt, days, expiresAt (derived)
redirects/{id}    from, to, status(301|308)
users/{uid}       email, role, active          (allowlist; claims synced by function)
audit/{id}        who, what, ref, at, diff summary
```

Security rules: public read of published content goes through the server only (Admin SDK). Client rules allow writes only from users with the `admin`/`editor` claim, and `settings`, `nav`, `banners`, `users` and `redirects` are admin-only.

## Section types (Q24)

| Type | Fields | Replaces |
|---|---|---|
| `hero` | title, subtitle, image, up to 2 buttons | `et_pb_fullwidth_header` |
| `richText` | TipTap JSON (tables allowed) | `et_pb_text` |
| `columns` | layout `1/2+1/2` or `3/4+1/4`, each column holds a list of sections | Divi rows |
| `linkBoxes` | items [icon, title, url] | `nswBoxes` / `nswStartPageLink` |
| `postList` | category?, count, "show more" | `et_pb_blog`, latest-posts block |
| `calendar` | feeds[], view list/month/week, hiddenByDefault[], pastDays, count, title | ICS Calendar plugin (5 pages) |
| `embed` | url from an allowlist (Google Maps, dans.se, YouTube, MS Forms), aspect ratio | `et_pb_code` iframes |
| `dansSeWidget` | widget href, fallback label | `cwLoadContent` (4 pages, 2 posts) |
| `fileList` | items [title, file, date], sort | Årsmöteshandlingar (45 PDFs) |
| `image` | media, caption, link | `et_pb_image` |
| `divider` | none | `et_pb_divider` |

Special components (not editable sections): `starBanner`, `pushSubscribe` (for `medlemstraning-2`), `tvCalendar` (route `/kalender-for-tv/`).

## Migration (one-time script, `apps/web/scripts/import-wp`)

1. Pull pages (31), posts (236), categories (7), tags (10) and media (424) from the WP REST API, using `context=edit` for raw content and an application password.
2. Convert Divi shortcodes to sections. Map `et_pb_text` to `richText` (HTML → PM JSON via TipTap's `generateJSON`), and map the other modules as in the table above. The one tabs module (Tävlingsträning) becomes two H2 blocks. Anything that can't be mapped lands in a `richText` block flagged `needsReview`.
3. Copy media and PDFs to Storage and rewrite URLs in the content. Generate `redirects` for every `/wp-content/uploads/...` URL.
4. Read the calendar shortcodes into `calendar` sections. Known feeds (public GCS files):
   - `cal_333077` Huvudkalender, `cal_333892` Kurskalender, `cal_358978` Tävlingskalender, `cal_358979` Eventkalender, `cal_337667` Friträning, `dans.se_competitions_all` Tävlingar
   - Per-page config: `hem-2` list of 6 ("På gång"); `kalender` month view with Tävlingar hidden; `kalender-for-tv` week view; `medlemstraning-2` month view with only Friträning shown; `medlemstraningar` month view with Friträning only.
5. Report broken links (for example 18 `www4.idrottonline.se` links) and `needsReview` blocks as a CSV.
6. The script is idempotent and keyed on `legacyId`, so it can be re-run for the final delta before cutover.

Known fixes to apply during import: the homepage "Facebook" box links to Instagram, and the PowerPuff star (`_hidden` class typo) shows an expired message.

## Phases and done criteria

| Phase | Scope | Done when |
|---|---|---|
| 1. Foundation | `apps/web` skeleton, App Hosting backends (prod + staging), design tokens, fonts, section components, CI (typecheck, unit, Playwright, Lighthouse CI, axe) | A sample page with all 11 sections passes the budgets in CI |
| 2. Import | WP import script, redirects, link report | Staging has all pages, posts and media. The report has been reviewed |
| 3. Public site | Routes, nav, footer, posts and categories, calendar (list/month/week, mobile list), search, SEO/OG/JSON-LD, RSS, sitemap, `llms.txt` | Visual comparison against WP looks OK, and Lighthouse budgets are green on 10 key URLs |
| 4. Admin | Auth and roles, page and post editors with live preview, versions, media library (images and video transcode), star banner, menu editor, settings, redirects, audit | An editor can update every page type and publish in under 10 s |
| 5. Integrations | `news-api` reads Firestore, push on publish, TV calendar, `pushSubscribe` section | The mobile app shows news from the new source |
| 6. Cutover | Editor review on staging, delta re-import, DNS switch, WP read-only | Cutover checklist complete (written in phase 5) |

## Test plan

**Local (each PR):**
- `pnpm --filter web typecheck && pnpm --filter web test`: unit tests for the TipTap renderer, section rendering, ICS parsing (fixtures from today's `cal_*.ics`), redirect matching, and banner expiry with an injected clock.
- `pnpm --filter web e2e` (Playwright against `next start` plus the Firestore emulator with seed data):
  - The menu works on desktop and mobile.
  - The calendar renders events and the month switch works.
  - A post page renders.
  - Admin login, edit, preview and publish updates the public page.
  - An expired banner is hidden.
- `pnpm --filter web lhci` must stay under the budgets. `pnpm --filter web a11y` must report no axe violations.
- Edge cases to cover:
  - a page with no sections
  - a post without an image (generated OG image)
  - ICS fetch failure (keep showing the last good render)
  - a video still processing
  - a banner with `days = 0`
  - Swedish characters in slugs (`årsmöteshandlingar`)

**Post-merge E2E (staging, then prod after cutover):**
- Deploy runs green. All 31 pages and a sample of 20 posts return 200 with the correct `<title>` and OG tags (validated with Facebook Sharing Debugger and Google Rich Results Test).
- 50 sampled old `/wp-content/uploads/...` URLs redirect.
- `/feed/` validates and Mailchimp pulls it.
- The calendar matches today's events, and a change in IdrottOnline shows up within 5 minutes.
- Upload a 2 GB phone video and check that the 720p/1080p renditions play on iOS Safari and Android Chrome.
- PageSpeed Insights on the home, calendar and a post page meets the budgets.
- The mobile app's news tab shows the new posts.

## Risks and open items

- Check whether App Hosting supports **Node 24**, which the repo now pins. If it doesn't, pin `apps/web` to Node 22.
- Check that App Hosting is offered in `europe-west4`.
- A mobile Lighthouse FCP ≤ 1.0 s depends on network RTT. If the CDN edge can't meet it, the hard limit stays 1.5 s.
- dans.se widget scripts are outside our control. They only load lazily, and the fallback link always works.
- The calendar's ICS URLs are public GCS objects, so they must stay public, or the server reads them with the Admin SDK instead.
- `news-api` and the mobile app read `wp-content` image URLs. The `/wp-content/uploads/*` redirects cover them until phase 5 moves them to Firestore.
