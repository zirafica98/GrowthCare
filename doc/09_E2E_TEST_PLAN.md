# GrowthCare — E2E Test Plan

Environment: two physical phones (iOS Safari + Android Chrome) or two browser profiles, against a **staging** Supabase project with migrations 001–004. Desktop Chrome for the sidebar layout. Run the RLS SQL test first (`supabase/tests/rls_isolation_test.sql`).

Accounts: Parent A, Parent B (real inboxes for e-mail confirmation), Unrelated U.

## A. Acceptance scenario (doc/08)

| # | Step | Expected |
|---|---|---|
| A1 | A registers, confirms e-mail, logs in | lands on /setup |
| A2 | Setup: family → child "Child 1" (DOB) → therapy (name, 0.4 mg, daily 22:00) → invite B → allow notifications | dashboard shows Child 1, medication, dose, 22:00 |
| A3 | Dashboard → "Evidentiraj dozu" → "Potvrdi da je dato" | ≤ 2 taps, toast, card shows "Dato" with time and A's name |
| A4 | B opens invite link, registers/logs in with invited e-mail, accepts | B sees the same child and the dose recorded by A |
| A5 | B tries to record the same dose (stale screen) | message "Ovu dozu je već zabeležio/la …"; still exactly one record |
| A6 | A: Documents → + → Camera → photo of a lab report → OCR on | review screen with "Automatski izvučeno — proverite podatke"; values editable, confidence shown |
| A7 | A edits one value, unticks one result, confirms | Laboratory shows only confirmed values; original document preserved |
| A8 | A creates appointment with 7d/1d/day-of reminders | appears in Calendar + Reminders, bell icon on visit |
| A9 | A records height/weight | Growth chart and dashboard metric update; velocity row when ≥ 28 days |
| A10 | Timeline | contains dose, document, lab, visit, measurement, therapy start in order |
| A11 | U logs in | sees nothing of family A; direct URLs (/app/doctors/<A visit id>, /app/documents/<id>) show "Nemate pristup"/not found |

## B. Doses & history
- Skip with reason (reason required), edit a past record, delete with confirmation; audit shows before → after.
- Unrecorded past day shows "Nezabeleženo"; tapping lets you record retroactively.
- Dose different from prescribed shows warning, still saved as entered.
- Adherence/weekly stats match manual count; text says "opisna statistika".

## C. Multiple children
- Add Child 2; switcher lists both; every screen header shows selected child.
- Open dose sheet for Child 1, switch to Child 2 from another tab → sheet closes, nothing saved.
- Notification tap selects the right child before navigating.

## D. Therapy
- Dose change shows previous/new/date confirmation; history periods update; no automatic change after OCR (only prefilled change form).
- Stock: add package; remaining estimate labelled "procena"; reminder at threshold.

## E. Documents & OCR
- Upload PDF, JPG, PNG, HEIC; >20 MB and .exe rejected.
- OCR failure (blurred photo) → "Nismo uspeli da očitamo dokument", manual metadata, retry.
- Signed URL expires (open preview, wait > 5 min, reload) → new URL works for member, copied URL fails after expiry.
- Delete document → file removed from storage bucket.

## F. Offline / sync
- Airplane mode: dashboard and history still show last data; offline bar visible.
- Record dose offline → sync chip shows pending count; reload app offline → still pending and visible.
- Reconnect → synced once; server has one record. Repeat with B recording same dose meanwhile → conflict toast, no duplicate.
- Logout with pending writes → warning dialog.

## G. Notifications
- Permission prompt; local notification at dose time while app open; quiet hours suppress non-dose reminders.
- "Doza još nije zabeležena" appears after configured minutes.
- With VAPID + cron: push arrives with app closed; payload contains no medical values.

## H. Family & security
- Invitation to wrong e-mail cannot be accepted; expired/revoked invitations rejected.
- Owner removes B → B immediately loses access (refresh).
- Password policy (≥ 8, letter + digit); reset password e-mail flow.
- Delete child (type-to-confirm) removes all data and files; delete family as owner.

## I. PWA / accessibility / performance
- Install to home screen (iOS + Android); app shell loads offline.
- Keyboard-only navigation of dose sheet; screen reader reads status badges ("Dato", not colour only).
- Lighthouse: PWA installable, Accessibility ≥ 95, Performance ≥ 85 on mid-range Android.
