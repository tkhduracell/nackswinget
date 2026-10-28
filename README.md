# Nackswinget

Website, mobile app and backend for Dansklubben Nackswinget, in one pnpm monorepo.

| Part | Path | What it is |
| --- | --- | --- |
| Website | `apps/web/` (`@nackswinget/web`) | The new nackswinget.se: Next.js on Firebase App Hosting, with an admin for pages, news, menu, banners and users. Standalone pnpm workspace. See [apps/web/README.md](apps/web/README.md). |
| Mobile app | `apps/mobile/` (`@nackswinget/mobile`) | Ionic Vue/Capacitor app for Android and iOS: calendars, friträning notifications, news. |
| Backend | `functions/` (`@nackswinget/functions`) | GCP Cloud Functions: calendar sync and booking against IdrottOnline, push notifications, news and competitions. See [functions/CLAUDE.md](functions/CLAUDE.md). |

GCP project `nackswinget-af7ef`. Data lives in Firestore (`eur3`) and the bucket `nackswinget-af7ef.appspot.com`.

## Structure

```
.
├── package.json          # @nackswinget/workspace (root scripts)
├── pnpm-workspace.yaml   # functions + apps/mobile (apps/web is excluded)
├── firebase.json         # App Hosting deploy config for apps/web
├── docs/                 # web-rebuild-plan.md
├── functions/            # Cloud Functions (Express apps, one per function)
└── apps/
    ├── mobile/           # Ionic Vue app (android/, ios/)
    └── web/              # Next.js site, own lockfile
```

## Prerequisites

- Node.js 24
- pnpm 10.14 (only pnpm is allowed; `preinstall` enforces it)

## Commands

Root workspace (functions + mobile):

```bash
pnpm install
pnpm build    # all packages
pnpm test
pnpm lint

pnpm --filter @nackswinget/functions run test
pnpm --filter @nackswinget/mobile run test:unit
```

Run one function locally (`calendars-api`, `calendars-update-api`, `notifications-api`, `competitions-api`, `news-api`):

```bash
pnpm --filter @nackswinget/functions run dev:calendars-api
```

Mobile app:

```bash
pnpm --filter @nackswinget/mobile run dev
pnpm --filter @nackswinget/mobile run android:build   # or android:open, ios:open
```

Website (its own workspace, run from `apps/web`):

```bash
cd apps/web
pnpm install
pnpm dev        # or dev:emulators against the Firebase emulators
pnpm typecheck && pnpm lint && pnpm test
```

## CI/CD

| Workflow | Trigger | Does |
| --- | --- | --- |
| `reviews.yaml` | PR to `main` | Build, test and lint functions; build the mobile app |
| `web.yaml` | PR to `main` touching `apps/web` | Lint, typecheck, unit tests, fixture build, Playwright smoke tests, Lighthouse budget |
| `deploy.yaml` | Push to `main` | Deploy all functions, update Cloud Scheduler, clean artifacts, notify Slack, build the Android release |
| `web-deploy.yaml` | Push to `main` touching `apps/web` | Deploy the website to Firebase App Hosting |
| `weekly.yaml` | Weekly | Clean old Artifact Registry images |

GCP auth uses Workload Identity Federation (`functions/setup-github-auth.sh`, `functions/setup-deployer.sh`).

Always branch off `main` and open a PR; never commit directly to `main`.

### Running CI locally

With [`act`](https://github.com/nektos/act):

```bash
act pull_request -j build-functions --container-architecture linux/amd64   # or test-functions, lint-functions, build-apps
```

## Booking API

```bash
curl 'https://europe-north1-nackswinget-af7ef.cloudfunctions.net/calendars-api/book' \
  --data-raw '{"title":"Test","location":"Ceylon","password":"XXX","date":"2024-01-23T23:00:00.000Z","time":"15:00","duration":60,"description":"Bob - 07026XXXXX"}'
```

## More documentation

- [Website](apps/web/README.md) and [rebuild plan](docs/web-rebuild-plan.md)
- [Functions](functions/CLAUDE.md)
- [Mobile app](apps/mobile/CLAUDE.md) and [Android](apps/mobile/android/README.md)
