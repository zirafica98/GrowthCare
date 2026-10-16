# GrowthCare — Security and Privacy Requirements

This application handles highly sensitive child health information. Security is a first-class product requirement, not a later feature.

## Authentication

- Supabase Auth
- strong password requirements
- email verification
- password reset
- session expiration strategy
- optional future MFA

## Authorization

Use family-based authorization.

A parent can access:
- families they belong to
- children belonging to those families
- associated documents, visits, labs and therapy data

No user can access another family's records by changing IDs in API requests.

## RLS

Enable RLS on all application tables containing family/child data.

Policies should be tested with:
- parent A
- parent B
- unrelated user
- deleted/revoked member

## Storage

Medical documents:
- private bucket
- signed URLs
- short expiration
- no public storage URLs

## Sensitive data

Do not put medical data:
- in analytics events
- in URLs
- in browser logs
- in error tracking payloads
- in third-party marketing tools

## Local storage

Only cache the minimum data necessary for offline operation.

Avoid storing raw medical documents in localStorage.

If IndexedDB is used, document the cached data and provide a clear logout cleanup strategy.

## Audit trail

Track:
- who changed therapy
- who recorded a dose
- who edited a measurement
- who uploaded/deleted documents
- who joined/left family

## Data export

Settings should offer a future/export-ready design:
- JSON structured data
- ZIP containing documents and a readable report

## Data deletion

Provide:
- delete document
- delete child
- delete family
- delete account

Use explicit confirmation.

## Backup/recovery

Production backend must have reliable database and storage backups.

## Production checklist

Before launch:
- RLS tests
- storage policy tests
- authentication tests
- authorization tests
- XSS protection
- CSRF considerations
- secure headers
- dependency scanning
- secret scanning
- error log review
- backup restore test
- mobile PWA install test
- offline/sync test
