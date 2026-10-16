# GrowthCare — Security Checklist

Status legend: ✅ done · 🔶 partially / needs production config · ⬜ to do before launch

## Authorisation & data isolation
- ✅ RLS enabled on every public table (verified: 0 tables without RLS).
- ✅ Access only through **active** family membership (`is_family_member`, SECURITY DEFINER, no policy recursion).
- ✅ Child-owned rows: denormalised `child_id` checked against parent row by triggers (no cross-child linking).
- ✅ `children.family_id` / `documents.family_id` immutable; doctor must belong to the visit's family.
- ✅ Clients cannot insert families/members directly; RPCs `create_family`, `create_invitation`, `accept_invitation`.
- ✅ Members can only change `status` (column privilege); role escalation impossible; revoked members cannot re-activate.
- ✅ Invitations: 192-bit random token, 7-day expiry, single use, bound to invited e-mail.
- ✅ `anon` role has no table access.
- ✅ Automated RLS test (`supabase/tests/rls_isolation_test.sql`) — passes on project `gdqgskrlmxczrjppfoko`.

## Storage
- ✅ Private bucket `medical-documents`, 20 MB limit, MIME allow-list.
- ✅ Path `{family}/{child}/{document}/{file}`; policies check membership *and* that the child belongs to that family.
- ✅ Only short-lived signed URLs (5 min); no public URLs.
- ✅ File names sanitised; DB trigger enforces storage path ↔ row consistency.

## Secrets
- ✅ Frontend contains only Project URL + anon key (public by design).
- ✅ `service_role`, OCR and VAPID private keys only as Edge Function secrets (`supabase/.env.example`).
- ✅ `scan/` (real medical documents) excluded from git.
- ⬜ Enable GitHub secret scanning + Dependabot on the repository.

## Medical-data hygiene
- ✅ No medical data in URLs (ids only), analytics (none), or logs (`ToastService` logs only error kind).
- ✅ OCR results stored as unverified candidates; nothing becomes structured data without parent confirmation.
- ✅ No dose recommendations / lab interpretation anywhere (flags only copied from the source).
- ✅ Push payloads minimal (no values).
- ✅ IndexedDB cache documented; cleared on logout.
- 🔶 Consider encrypting the IndexedDB cache with a per-session key for shared devices.

## Auth
- ✅ E-mail confirmation on; minimum password length 8 (+ client rule letter+digit).
- ✅ Password reset via redirect allow-list.
- ⬜ Add production URL to Site URL / redirect allow-list; remove localhost in production project.
- ⬜ Optional MFA (Supabase TOTP) for parents.
- 🔶 Leaked-password protection (Supabase Pro plan).

## Web hardening (hosting)
- ⬜ HTTPS only + HSTS.
- ⬜ Security headers at the host:
  `Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdn.jsdelivr.net https://tessdata.projectnaptha.com; img-src 'self' data: blob: https://*.supabase.co; frame-src blob: https://*.supabase.co; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(self), geolocation=()`.
- ✅ Angular template escaping (no `innerHTML` with user data; only static icon SVG is trusted).
- ✅ CSRF: Supabase uses bearer tokens (no cookie auth) → not applicable.

## Operations
- ⬜ Point-in-time recovery / daily backups (Supabase Pro) + restore drill.
- ⬜ Error-log review (no payloads), alerting on Edge Function failures.
- ⬜ Dependency scanning (`npm audit`) in CI.
- ⬜ Mobile PWA install test, offline/sync test (doc/09 sections F & I).
