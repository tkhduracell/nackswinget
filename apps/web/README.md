# @nackswinget/web

The new nackswinget.se: Next.js on Firebase App Hosting (backend `nsw-web`, `europe-west4`). See `docs/web-rebuild-plan.md` for the full plan.

This app is a standalone pnpm workspace, excluded from the root workspace, so that App Hosting can build it with its own lockfile.

## Commands

Run these from `apps/web`:

- `pnpm install`
- `pnpm dev`: local dev server (`.claude/launch.json` runs it on http://localhost:3100)
- `pnpm build`: production build
- `pnpm lint`

## Deploy

Run from the repo root (uses `firebase.json` / `.firebaserc`):

```bash
firebase deploy --only apphosting --project nackswinget-af7ef
```

The deploy uploads the repo root minus the paths ignored in `firebase.json`. App Hosting then builds `apps/web`.

Preview URL: https://nsw-web--nackswinget-af7ef.europe-west4.hosted.app (`noindex` until cutover).

## SEO: filling alt texts and descriptions with Claude

`scripts/seo-fill.ts` suggests alt texts for images whose alt is empty or a file name, and meta descriptions for pages whose description would be under 70 characters. Nothing editors wrote is touched, and nothing reaches the site before review:

```bash
export ANTHROPIC_API_KEY=...            # or an `ant auth login` profile
pnpm seo:fill suggest --url https://nsw-web--nackswinget-af7ef.europe-west4.hosted.app   # --only alt|description, --limit N
# review content/seo-suggestions.json: edit "suggestion", or set "approved": false
pnpm seo:fill apply --url https://nsw-web--nackswinget-af7ef.europe-west4.hosted.app     # --dry-run to count first
```

Both steps use the `IMPORT_TOKEN` in `~/.config/nsw/import-token` (`/api/import/seo/`). Apply publishes through the admin's normal path, so every change gets a version (undo in the admin) and an audit entry as `seo-fill@nackswinget.se`. Documents with an open draft in the admin are skipped, and a field an editor changed after `suggest` is left as is. `suggest` resumes where it stopped.
