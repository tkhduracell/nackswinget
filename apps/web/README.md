# @nackswinget/web

The new nackswinget.se: Next.js on Firebase App Hosting (backend `nsw-web`, `europe-west4`). See `docs/web-rebuild-plan.md` for the full plan.

This app is a standalone pnpm workspace, excluded from the root workspace, so that App Hosting can build it with its own lockfile.

## Commands

Run these from `apps/web`:

- `pnpm install`
- `pnpm dev`: local dev server at http://localhost:3000
- `pnpm build`: production build
- `pnpm lint`

## Deploy

Run from the repo root (uses `firebase.json` / `.firebaserc`):

```bash
firebase deploy --only apphosting --project nackswinget-af7ef
```

The deploy uploads the repo root minus the paths ignored in `firebase.json`. App Hosting then builds `apps/web`.

Preview URL: https://nsw-web--nackswinget-af7ef.europe-west4.hosted.app (`noindex` until cutover).
