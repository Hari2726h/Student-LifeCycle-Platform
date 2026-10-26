# Maatram Student Lifecycle Platform

One integrated record of a person's whole journey with Maatram — from
application, through admission, through college, to alumni career —
replacing separate admissions/attendance/alumni spreadsheets that drift
apart over time.

Built against the MH26-05 problem statement's four connected parts:

| # | Part | Where it lives |
|---|---|---|
| 1 | **Event log with replay** — every important change recorded as an append-only event, in the same transaction as the change; workers replay from start/a timestamp/their bookmark, idempotently, without missing events committed out of order | `lib/events.ts`, `lib/workers/engine.ts`, `lib/workers/risk-flag-notifier.ts`, `/staff/events` |
| 2 | **Alumni career tracker** — source-tagged career history (self-reported/referral/placement); current profile is *derived* by replaying that history, never edited directly; company-name spelling variants merge via deterministic rules | `lib/alumni-career.ts`, `lib/company-normalize.ts`, `/portal`, `/staff/alumni` |
| 3 | **Admission, end to end** — public application with saved drafts, cycle-gated submission, staff bulk shortlist/select/reject with required reasons, year-over-year cycle comparison, full audit trail | `app/apply/*`, `lib/cycles.ts`, `app/staff/bulk-actions.ts`, `/staff/cycles`, `/staff/applicants/[id]` (History tab) |
| 4 | **Smart uploads** — browsers PUT documents directly to S3-compatible storage via short-lived signed URLs; the server only validates type/size and swapping storage providers is a config change | `lib/storage.ts`, `app/apply/steps/documents.tsx`, `app/api/documents/[id]/route.ts` |

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind ·
PostgreSQL (Docker) · Prisma · NextAuth v5 (Credentials + JWT sessions) ·
S3-compatible object storage (S3Mock locally, via the AWS SDK) · Vitest

No secrets are committed — `.env` is git-ignored; `.env.example` documents
every variable the app needs.

## Getting started

```bash
npm install
cp .env.example .env     # defaults work as-is for local dev
npm run db:up             # docker compose: Postgres + S3-compatible storage
npm run db:migrate         # applies prisma/migrations
npm run db:seed            # synthetic applicants/students/alumni across every stage
npm run dev                 # http://localhost:3000
```

`npm run db:up` starts the two stateful services (Postgres on `5432`,
object storage on `9090`) via `docker-compose.yml`. The Next.js app itself
runs with `npm run dev`/`npm run build && npm start`, not inside Docker.

## Demo accounts (seeded)

Password for every account: `Passw0rd!`

| Email | Role |
|---|---|
| `staff@maatram.org` | Staff — full pipeline, bulk actions, cycles, event log, alumni directory |
| `committee@maatram.org` | Selection committee — interview queue, scoring, decisions |
| `volunteer@maatram.org` | Field volunteer — verification queue for assigned applicants |
| `mentor1@maatram.org` | Mentor — mentees, check-ins, risk flags |
| `applicant1@example.com` … `applicant22@example.com` | Applicants/students/alumni spanning every lifecycle stage |

A few specific ones worth knowing: `applicant6@example.com` is
mid-pipeline (`VERIFIED`); `applicant21@example.com` and
`applicant22@example.com` are `ALUMNI` with a placement and career
history to query.

See [DEMO.md](DEMO.md) for a step-by-step walkthrough of the trickiest
behaviors (replay, out-of-order events, company merging, the full
apply→shortlist→select flow, cycle filtering, and oversized-upload
rejection).

## Tests

```bash
npm test
```

Unit tests cover pure logic (company-name merging, the deservingness
scorer, upload validation). Integration tests run against the real local
Postgres (`npm run db:up` first) and cover the two trickiest stateful
pieces: the replay engine's idempotency/out-of-order handling, and the
alumni career projection's replay-and-merge behavior. Every integration
test creates its own throwaway fixtures and tears them down in `afterEach`
— running the suite never touches seed data.

## Project structure

- `prisma/schema.prisma` — the full data model; `prisma/seed.ts` plants
  realistic, fully-linked synthetic data (never real student details).
- `lib/` — domain logic, kept separate from routes so it's testable on its
  own: events, replay workers, alumni career, company normalization,
  cycles, storage, deservingness scoring, mentor matching.
- `app/` — role-scoped routes (`/applicant`, `/portal`, `/mentor`,
  `/staff/*`) and the public `/apply` wizard, each a Server Component that
  re-derives its own data from the session — never a client-sent ID.
- `test/` — Vitest unit + integration tests.

## Useful commands

```bash
npm run db:studio   # browse the database visually
npm run db:reset     # wipe and re-migrate + re-seed
npm run lint          # eslint
npx tsc --noEmit      # typecheck
```
