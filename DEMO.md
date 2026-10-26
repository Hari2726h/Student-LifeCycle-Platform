# Demo walkthrough

A short, runnable tour covering each behavior the problem statement calls
out specifically. Start from a freshly seeded database
(`npm run db:up && npm run db:migrate && npm run db:seed && npm run dev`),
sign in at `http://localhost:3000/login` with the demo accounts from the
[README](README.md) (password `Passw0rd!` for all), and follow along.

---

## 1. Event replay — from start, from a timestamp, idempotently

Sign in as `staff@maatram.org` → **Events** in the sidebar
(`/staff/events`).

This page shows the raw event log (latest 50, newest first) and controls
for the `risk-flag-notifier` background worker, whose whole job is:
*turn a `RISK_FLAG_LOGGED` event into a `Notification` for every staff
member, exactly once, no matter how many times it's replayed.*

1. Note the current **Bookmark (sequence)** and **notifications sent**
   counts.
2. Click **Replay from start**. The bookmark rewinds to 0 and the worker
   reprocesses every `RISK_FLAG_LOGGED` event in the log.
3. Click **Replay from start** again, immediately. The notification count
   is *exactly the same* as after the first replay — nobody gets a
   duplicate alert. This is the `(sourceEventId, recipientId)` unique
   constraint on `Notification` (`lib/workers/risk-flag-notifier.ts`): the
   worker always calls `upsert`, so replaying the same event twice writes
   the same row twice, not two rows.
4. Try **Replay from timestamp** with a date a few days in the past — it
   rewinds the bookmark to just before the first qualifying event at that
   time and reprocesses forward. Same guarantee: safe to run as many times
   as you like.

## 2. Out-of-order events — the safety-lag window

Sign in as `mentor1@maatram.org` → pick any mentee → **Students**
(`/mentor/students/[id]`).

1. Log a check-in, ticking the **risk flag** checkbox, and submit.
   This appends a `RISK_FLAG_LOGGED` event in the *same transaction* as the
   mentor-log row (`app/mentor/actions.ts`) — the event can never exist
   without the write it describes, and vice versa.
2. Immediately go to `/staff/events` and click **Process new events**.
   It reports **processed 0 events** — not because nothing happened, but
   because the event is still inside the worker's 2-second *safety-lag*
   window (`lib/workers/engine.ts`). The cursor is `sequence`, not a
   timestamp, specifically because two concurrent transactions can grab
   sequence numbers 5 and 6 and commit in either order; the lag gives a
   slower, lower-sequence transaction time to land before a worker treats
   anything newer as "safe," so a worker can never race past an
   in-flight commit and silently skip it once its bookmark advances.
3. Wait ~3 seconds and click **Process new events** again — now it
   reports **processed 1 event**, and the mentee shows up on the staff
   dashboard's "Needs follow-up" list with the risk flag.

## 3. Alumni career queries — source-tagged history, company merging

Sign in as `staff@maatram.org` → **Alumni** (`/staff/alumni`).

1. Search **Company** for `Zoho`. Note the matches.
2. Search again for `Zoho Corporation Pvt Ltd` or `ZOHO LIMITED` — same
   results, because `lib/company-normalize.ts` deterministically folds
   case, punctuation, and legal suffixes (and a small alias table for
   initialisms like `TCS` → `Tata Consultancy Services`) before comparing,
   rather than fuzzy-matching.
3. Log a new career event for any alumnus (source: Referral or Placement)
   with no end date, then look at their profile — their *previous*
   open-ended role automatically got an end date backfilled to the new
   role's start date, and the **current** company/role shown is never
   hand-edited: it's derived by replaying that alumnus's full
   `CareerEvent` history (`recomputeProjection` in
   `lib/alumni-career.ts`). Click **Recompute all profiles** to see this
   replay run for every alumnus at once, proving the projection is
   reproducible from history alone, not just cached.
4. On `/portal`, sign in as an alumnus (e.g. `applicant22@example.com`)
   and self-report a career update — same replay mechanism, tagged
   `SELF_REPORTED` instead of `REFERRAL`/`PLACEMENT`.

## 4. Apply → shortlist → select → onboard

1. **Apply** (new tab, logged out): go to `/apply`, sign in with any phone
   number (OTP is shown on-screen in this dev build, never actually
   texted), and fill out the multi-step wizard — personal → academic →
   family/income → documents → review. Drafts save as you go; you can
   close the tab and resume at the same step.
2. **Shortlist/select, in bulk, with a reason**: sign in as
   `staff@maatram.org` → `/staff`. Tick a few applicants in **Full
   pipeline**, type a reason (required), and click **Shortlist selected**.
   The banner reports how many were updated and how many were skipped —
   applicants in the wrong status for that action (e.g. already rejected)
   are *skipped, not failed* (`app/staff/bulk-actions.ts`).
3. Repeat with **Select selected** on a shortlisted/interviewed applicant
   — this creates the linked `Student` record once accepted.
4. **Audit trail**: open that applicant's detail page
   (`/staff/applicants/[id]`) → **History**. Every status change is listed
   chronologically with who did it, the from/to status, and the reason —
   read straight from the same event log as part 1, not a separate audit
   table.

## 5. Cycle filtering — year-over-year, gated submission

Sign in as `staff@maatram.org` → **Cycles** (`/staff/cycles`).

1. See the year-over-year table: applied/shortlisted/accepted/rejected
   counts and placement rate per cycle.
2. Create a new cycle for next year to see it added to the comparison.
   There's no "close a cycle" action in the UI (only create), so to see
   the *rejection* path specifically: run `npm run db:studio`, open
   `AdmissionCycle`, and set the seeded 2026 cycle's `closesAt` to a past
   date. Then go to `/apply` logged out and start a brand-new application
   (a new phone number) — step 1 is rejected with *"Applications are
   closed for this year. Please check back for the next cycle."* A cycle
   is only required to *start* a new draft; it's checked once, at
   creation (`app/apply/actions.ts`), and the applicant keeps whatever
   cycle they were born into from then on. (Set `closesAt` back to
   `2026-12-31` afterward to leave the seed data as found.)
3. An applicant who already has an in-progress draft can keep editing it
   (steps 1–4) even after their cycle closes — but *final submission*
   (step 5) checks `isCycleOpen` again and is blocked with *"This
   admission cycle has closed. Your draft is saved but can't be
   submitted—please contact Maatram staff."* Nothing is lost, it just
   can't complete itself past a closed window.

## 6. Rejecting an oversized upload

On the **Documents** step of `/apply` (step 4), try uploading any file
over 8MB.

The file never leaves the browser for the app server: the client asks for
a presigned upload URL first (`requestDocumentUploadUrlAction` in
`app/apply/actions.ts`), which calls `validateUpload` in `lib/storage.ts`
— size and MIME type are checked *before* a signed URL is ever issued. The
request fails fast with an inline **"File must be under 8MB"** error next
to that upload slot, and no bytes are ever sent to storage.

The same validation runs again server-side after upload — on `confirmUpload`
— by `HEAD`ing the object and comparing its real size to what was
declared, closing the gap where a client could lie about size to get a
signed URL and then upload more anyway.
