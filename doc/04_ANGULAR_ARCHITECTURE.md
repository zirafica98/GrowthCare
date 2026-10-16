# GrowthCare — Angular Architecture

## Stack

Frontend:
- Angular
- TypeScript strict mode
- Angular Router
- Reactive Forms
- Angular Signals where appropriate
- Angular Service Worker / PWA
- responsive mobile-first CSS

Backend:
- Supabase Auth
- PostgreSQL
- Supabase Storage
- Edge Functions / server-side processing

Charts:
Use a maintained chart library compatible with Angular.

## Feature structure

Suggested:

src/app/
  core/
    auth/
    guards/
    interceptors/
    services/
    models/
  shared/
    components/
    directives/
    pipes/
    ui/
  layouts/
    auth-layout/
    app-layout/
  features/
    dashboard/
    doses/
    history/
    growth/
    therapy/
    doctors/
    laboratory/
    documents/
    calendar/
    family/
    settings/

Prefer feature-based organization over a huge generic components folder.

## State management

Do not introduce a large state library unless complexity justifies it.

Use:
- Signals
- injectable services
- RxJS for async streams
- route state where appropriate

Server data should have a clear source of truth.

## Offline-first

PWA requirements:
- app shell cached
- previously loaded child data available offline
- dose recording should be resilient to temporary connectivity loss
- queue pending writes locally
- synchronize when online
- show sync state

Important:
Medical writes must have idempotent identifiers to prevent duplicate dose records during synchronization.

## Authentication

Flow:
- login
- session restoration
- protected routes
- logout
- password reset
- invitation acceptance

## Route structure

/
 /login
 /setup
 /app
 /app/dashboard
 /app/history
 /app/growth
 /app/therapy
 /app/doctors
 /app/laboratory
 /app/documents
 /app/calendar
 /app/family
 /app/settings

Child selection should be persistent in app state but must never override authorization.

## Services

AuthService
FamilyService
ChildService
DoseService
TherapyService
GrowthService
DoctorService
LaboratoryService
DocumentService
OcrService
ReminderService
NotificationService
AuditService
OfflineSyncService

## Forms

All forms:
- Reactive Forms
- validation
- touched/dirty states
- autosave only where safe
- explicit save for medical data
- unsaved-change protection

## Error handling

Central error service:
- network errors
- auth errors
- permission errors
- upload errors
- OCR errors
- sync conflicts

Never show raw backend errors to users.

## Security

Never put service-role credentials in Angular.

Use public Supabase client credentials only on the client.

All privileged processing happens server-side.

## Environment configuration

Use environment-specific configuration:
- local
- staging
- production

Do not commit secrets.

## Testing

Unit:
- services
- calculations
- forms
- status transitions

Component:
- dose flow
- OCR review
- child switching
- document upload

E2E:
- registration/login
- invite parent
- add child
- record dose
- edit dose
- add measurement
- create appointment
- upload document
- verify OCR
- offline queue
- reconnect/sync
