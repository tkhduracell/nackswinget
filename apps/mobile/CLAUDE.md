# CLAUDE.md — mobile

Ionic Vue 7 + Capacitor 5 app (Vue 3, Vite 5, TypeScript). App id `org.nackswinget.apps` (Android package `org.nackswinget.app`). The app is Swedish-language.

## Commands

- `pnpm dev`: vite dev server. `/api` is proxied to the prod Cloud Functions (`vite.config.ts`).
- `pnpm build`: `vue-tsc && vite build`. `pnpm lint` runs eslint.
- `pnpm test:unit`: vitest (jsdom, globals). Run a single file with `pnpm test:unit tests/unit/example.spec.ts`.
- `pnpm test:e2e`: cypress.
- Native:
  - `android:sync` / `ios:sync`: production build plus `cap sync`
  - `android:open:live` / `ios:open:live`: live reload on a device
  - `android:build`: gradle `bundleRelease`
  - `android:upload`: Play publish

## Architecture

- Views live in `src/views/` (Tabs, Calendar, Book, News), and routing is in `src/router/`.
- Data access goes through composables in `src/compsables/` (the folder name is misspelled; keep it). `client.ts` provides `NswApiClient` through Vue `provide`/`inject`:
  - Native platforms call the Cloud Functions URL directly, and web uses the `/api` proxy.
  - Both can be overridden with `VITE_API_BASE_URL`. The bucket defaults to `nackswinget-af7ef.appspot.com` (`VITE_BUCKET`).
- Push notifications use `@capacitor-community/fcm` and topic subscriptions via `notifications-api` (`/status`, `/subscribe`, `/unsubscribe` in `compsables/client.ts`).
- The Android release is built and signed in CI. The keystore comes from GCP Secret Manager (`GOOGLE_PLAY_KEYSTORE*`). See `android/README.md`.
