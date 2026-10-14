# Maatram Student Lifecycle Platform — Phase 1

Foundation for the "Application to Alumni" platform: schema, auth, and
role-scoped dashboards. No user-visible form yet (that's Phase 2) — this
phase proves every later module has a correct, trustworthy base to write to.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind · PostgreSQL (Docker) ·
Prisma 6 · NextAuth v5 (Credentials + JWT sessions)

## Getting started

```bash
npm install
cp .env.example .env        # already done if you're continuing this session
npm run db:up                # starts Postgres in Docker
npm run db:migrate           # applies prisma/migrations
npm run db:seed              # plants a realistic, fully-linked pipeline
npm run dev                  # http://localhost:3000
```

## Demo accounts (seeded)

Password for every account: `Passw0rd!`

| Email | Role |
|---|---|
| `staff@maatram.org` | Staff (full pipeline + at-risk dashboard) |
| `committee@maatram.org` | Selection committee (interview queue) |
| `volunteer@maatram.org` | Field volunteer (verification queue) |
| `mentor1@maatram.org` | Mentor (mentees + check-ins + risk flags) |
| `applicant1@example.com` … `applicant22@example.com` | Applicants/students/alumni across every lifecycle stage |

`applicant6@example.com` is mid-pipeline (VERIFIED); `applicant21@example.com`
and `applicant22@example.com` are ALUMNI with a placement and an active
Karpom Karpippom tutoring session.

## What's actually built

- **Schema** (`prisma/schema.prisma`) — Applicant → Verification →
  InterviewRecord → Student → Mentor/Certification/AcademicRecord →
  Placement → AlumniProfile/KarpomSession, with sensitive PII split into its
  own table from day one.
- **Auth** — Credentials + JWT sessions, 7 roles, route-gating middleware
  (`middleware.ts`) that redirects unauthenticated users to `/login` and
  cross-role access back to the user's own home.
- **Dashboards**, each scoped server-side by session (never by a client-sent
  ID): `/applicant`, `/portal` (student/alumni), `/mentor`, `/staff`
  (staff/committee/volunteer, branches per role).
- **Seed script** (`prisma/seed.ts`) — 22 applicants distributed across every
  `ApplicationStatus`, 7 of them promoted to `Student` and spread across
  `ONBOARDING → ACTIVE (incl. one at-risk) → PLACED → ALUMNI`.

## Not built yet (Phase 2+)

The public application wizard, file uploads, OTP save-and-resume, interview
scheduling UI, and real Row-Level Security — see the plan's §8 roadmap.

## Useful commands

```bash
npm run db:studio   # browse the database visually
npm run db:reset     # wipe and re-migrate + re-seed
```
