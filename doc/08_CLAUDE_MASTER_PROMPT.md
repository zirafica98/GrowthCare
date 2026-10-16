# MASTER PROMPT FOR CLAUDE

You are a senior product engineer, UX designer and Angular architect.

Build a production-quality PWA called “GrowthCare” based on the attached specification files.

## Product

GrowthCare is a private family application for tracking a child's growth-hormone therapy, growth measurements, appointments, laboratory results, reminders and medical documents.

The application supports multiple children and multiple parent accounts in the same family.

This is a tracking/organization application, NOT a medical decision-support system.

## Non-negotiable medical rule

Never recommend, calculate or infer a medically appropriate hormone dose.

The app may calculate descriptive statistics such as adherence, total recorded doses, growth velocity and historical changes, but it must not make clinical recommendations.

All automatically extracted medical data must be reviewed and confirmed by a parent before becoming structured data.

## Technical requirements

Frontend:
- Angular
- TypeScript strict mode
- Angular PWA
- responsive mobile-first design
- Signals where useful
- Reactive Forms
- RxJS where appropriate

Backend:
- Supabase Auth
- PostgreSQL
- Row Level Security
- Supabase Storage
- server-side/Edge Functions for privileged processing

Architecture:
- feature-based Angular architecture
- reusable UI components
- clean service boundaries
- no secrets in frontend
- strict authorization

## Main modules

Implement:
1. Dashboard
2. Daily dose tracking
3. Injection history
4. Therapy
5. Growth
6. Doctor visits
7. Laboratory
8. Documents
9. OCR/AI review
10. Calendar
11. Reminders
12. Notifications
13. Family and parent invitations
14. Multiple children
15. Settings
16. Audit trail

## UX priority

The most frequent task is recording the daily dose.

A parent must be able to:
Dashboard → Today's dose → Confirm

in approximately 1–2 interactions after opening the relevant card.

Always show:
- selected child
- medication
- dose
- scheduled time

## PWA

Implement:
- installable PWA
- service worker
- app shell caching
- offline-friendly reads
- safe offline write queue
- synchronization after reconnect
- idempotent writes
- visible sync status

Do not duplicate dose records during reconnect.

## Design

Use a calm, trustworthy, warm medical-family visual style.

Mobile-first.

Bottom navigation:
- Home
- History
- Growth
- Calendar
- More

Use the UI specification from `02_UX_UI_DESIGN.md`.

## Database

Implement the schema from `03_DATABASE.md`.

All tables must have appropriate timestamps and indexes.

Use UUIDs.

Implement RLS before connecting production data.

## Documents

Medical documents must be stored in private storage.

Never expose permanent public URLs.

Use signed URLs.

Support:
- PDF
- JPG/JPEG
- PNG
- HEIC where practical

Support camera/gallery/file selection.

## OCR

Implement the flow:
Upload → OCR → Extraction → Review → Confirm → Save.

Never silently convert OCR output into medical records.

The review UI must show extracted fields as editable.

## Notifications

Support:
- dose reminders
- appointment reminders
- lab reminders
- measurement reminders
- medication stock reminders
- custom reminders

Provide notification preferences.

## Multiple children

Every child-specific screen must be scoped to the selected child.

Create a persistent child switcher.

Prevent accidental cross-child actions.

## Audit

Implement audit logging for:
- dose records
- therapy changes
- measurements
- document actions
- family membership

## Testing

Write tests for:
- authentication
- RLS
- family isolation
- child switching
- dose recording
- missed dose recording
- therapy changes
- growth calculations
- OCR review
- document access
- offline synchronization
- notification scheduling

## Development approach

Do not generate the entire application blindly in one huge file.

Build in logical phases:

Phase 1:
- project setup
- design system
- authentication
- family/child model
- dashboard shell

Phase 2:
- doses
- history
- therapy

Phase 3:
- growth
- doctors
- calendar
- reminders

Phase 4:
- documents
- storage
- OCR review

Phase 5:
- offline/PWA synchronization
- notifications
- audit

Phase 6:
- security hardening
- tests
- performance
- accessibility

After each phase, ensure the project remains runnable.

## Code quality

- no unnecessary duplication
- typed models
- reusable components
- clear naming
- small services
- defensive error handling
- loading/error/empty states everywhere
- accessible controls
- mobile-first responsive layout

## Important UX rule

Never make the interface feel like an administrative hospital application.

It should feel like a private, calm family health companion.

## Deliverables

Produce:
1. Complete Angular application
2. Supabase schema/migrations
3. RLS policies
4. Storage policies
5. Seed/demo data
6. README
7. Environment example
8. Unit tests
9. E2E test plan
10. PWA configuration
11. OCR integration abstraction
12. Notification abstraction
13. Security checklist

Use mock adapters where an external OCR/AI provider has not yet been configured, but keep the interfaces production-ready.

Do not hard-code a specific AI vendor into business logic.

## Final acceptance criteria

The following scenario must work:

Parent A logs in.
→ sees family
→ selects Child 1
→ sees today's hormone dose
→ records the dose
→ Parent B logs in on another phone
→ sees the same child and dose
→ Parent A uploads a laboratory image
→ OCR extracts candidate values
→ Parent A reviews and confirms them
→ laboratory results appear in the child's record
→ Parent creates a doctor appointment
→ reminders are configured
→ height is recorded
→ growth chart updates
→ timeline contains the complete history.

The application must protect Child 1's data from any unrelated account.
