# CLAUDE.md — functions

GCP Cloud Functions (gen2, nodejs20) backend. TypeScript, Express 5, CommonJS.

## Commands

- `pnpm build` (tsc), `pnpm typecheck`, `pnpm lint` (eslint src)
- `pnpm test`: jest with `DOTENV_CONFIG_PATH=.env.test`. The jest config forces `TZ=Europe/Stockholm`.
- Single test: `pnpm test -- src/lib/booking.test.ts` or `pnpm test -- -t "test name"`
- Run one function locally: `pnpm dev:<name>` (nodemon) or `pnpm run:<name>`, where `<name>` is `calendars-api`, `calendars-update-api`, `notifications-api`, `competitions-api`, or `news-api`. It loads `.env` via dotenv and listens on `PORT` (default 8080). Fetch secrets with `fetch-secrets.sh`.
- There is no plain `dev` script, despite what the root README says.
- Static test pages: `pnpm dev:index` (FCM test page) and `pnpm dev:book` (booking page proxied to prod).

## Architecture

- Each `src/*-api.ts` is a standalone Express app (`export default app`). It also listens on its own when run directly (`require.main === module`). `src/index.ts` registers each app with functions-framework `http(name, app)`, and the name must match the deploy entry point.
- Deploy (`.github/workflows/deploy.yaml`): esbuild bundles `src/index.ts` into `dist/index.js`. A few packages stay external: functions-framework, scheduler, storage, and puppeteer. A jq step generates a minimal `dist/package.json`, and the job copies `static/` and `.puppeteerrc.js` into `dist/`. A matrix then deploys each function with its own secrets, memory, and concurrency.
  - Adding a function takes three steps: create a new `*-api.ts`, register it in `index.ts`, and add a matrix entry. If it runs periodically, also add a Cloud Scheduler job.
  - A new runtime dependency that esbuild can't bundle must be added to both the externals list and the generated package.json.
- Periodic work runs on Cloud Scheduler (region `europe-west6`), which POSTs to `/update` endpoints. The schedules are defined in the `update-scheduler` job of the deploy workflow.
- Env vars are validated with zod schemas in `src/env.ts` (`GCloudOptions`, `IDOActivityOptions`). Parse them inside handlers, not at module load.
- Logging: `src/logging.ts` is a pino logger that emits GCP structured logs (`severity`, plus the trace from `X-Cloud-Trace-Context` via AsyncLocalStorage). Output is pretty-printed locally. Use `logger`, not `console`.
- Time: inject `Clock` (`lib/clock.ts`, `ClockFactory.native()`) so tests can control it. All date logic assumes `Europe/Stockholm` (date-fns-tz).
- Errors: the `errorHandling` middleware (`src/middleware.ts`) returns `{ error, success: false }` with `err.status` or 500.

### Calendar data flow (core domain)

The external source is IdrottOnline's "Activity" system (`ACTIVITY_*` secrets in Secret Manager).
1. `calendars-update-api` does the full update about every 2 hours (1GiB memory, concurrency 1):
   - Puppeteer logs in (`login` in `lib/calendars.ts`) and stores the session cookies in Firestore at `browser/org-<orgId>`.
   - It scrapes the calendar list, then fetches activities through `ActivityApi` (`lib/booking.ts`).
   - On failure, it dumps screenshots to GCS (`lib/screenshots.ts`).
2. `calendars-api` `POST /update` does the lean update every 5 minutes. It reuses the stored cookies and the calendars already known in the Firestore `calendars` collection, so no browser runs.
3. `updateCalendarContent` does the rest:
   - builds `.ics` files (`lib/ical-builder.ts`) and writes them to GCS as `cal_<id>.ics`, plus an `index.json`
   - writes calendar metadata to Firestore
   - sends FCM notifications when calendars change (`lib/notifications.ts`)
4. `calendars-api` also serves the calendars (`GET /?id=`) and handles booking (`/book`, `/book/search`). Booking creates activities through `ActivityApi` using the stored cookies.

Other functions:
- `news-api`: RSS feed → JSON in GCS
- `competitions-api`: scrapes competitions → `.ics` in GCS (`lib/competitions.ts`)
- `notifications-api`: FCM topic subscribe, unsubscribe, and trigger

## Tests

Tests use Jest with supertest, calling the exported Express apps directly. Each test file mocks firebase-admin, `@google-cloud/*`, and the lib modules with `jest.mock` at the top. `src/calendars-api.test.ts` shows the pattern.
