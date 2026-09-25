# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

pnpm monorepo (Node 20, pnpm 10.14) for Nackswinget (NSW):
- `functions/` (`@nackswinget/functions`): GCP Cloud Functions backend. See `functions/CLAUDE.md`.
- `apps/mobile/` (`@nackswinget/mobile`): Ionic Vue/Capacitor mobile app. See `apps/mobile/CLAUDE.md`.

GCP project `nackswinget-af7ef`, region `europe-north1`, bucket `nackswinget-af7ef.appspot.com`. Only pnpm is allowed (`preinstall` enforces it).

## Commands

- `pnpm install`
- `pnpm build | test | lint` run recursively across all packages.
- Per package: `pnpm --filter @nackswinget/<functions|mobile> run <script>`
- Run CI locally with `act`: `act pull_request -j <build-functions|test-functions|lint-functions|build-apps> --container-architecture linux/amd64`

## CI/CD

- `.github/workflows/reviews.yaml`: builds, tests, and lints on PRs to main.
- `.github/workflows/deploy.yaml`: on push to main, deploys all functions, updates the Cloud Scheduler jobs, cleans artifacts, notifies Slack, and builds the Android release.
- `.github/workflows/weekly.yaml`: weekly cleanup of Artifact Registry images (`functions/clean-artifacts.sh`).
- GCP auth uses Workload Identity Federation (`functions/setup-github-auth.sh`, `setup-deployer.sh`).

## Conventions

- Branch off `main` and open a PR. Never commit directly to main (`.github/instructions/change-management.instructions.md`).
- `.mcp.json` provides the GCP logging and monitoring MCP servers for inspecting deployed functions.
