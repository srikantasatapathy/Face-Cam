# Face-Cam — Development Checklist

> Companion to [PROJECT_DESCRIPTION.md](./PROJECT_DESCRIPTION.md).
> When a phase completes, write its entry in [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md).
> Phases 0 and 1 are complete and verified. Phases 2 to 8 are not started.
> Legend: **BE** = backend (NestJS) · **FE** = frontend (Next.js) · **INF** = infrastructure

---

## Phase 0 — Foundation ✅ complete

Verified running: API on 4000, web on 3100, Postgres on 5436, all six Docker
services up, `/health` reporting every dependency, lint and typecheck clean.

### Infrastructure

- [x] INF: Initialize pnpm workspace with `apps/api`, `apps/web`, `packages/shared`
- [x] INF: Root `.gitignore` (add `uploads/`, `.env`, `node_modules`, `.next`, `dist`)
- [x] INF: `.env.example` at root with every variable from the spec
- [x] INF: Enable `pgvector` extension on the existing Postgres instance
- [x] INF: Verify Postgres connection and Adminer access with the project `DATABASE_URL`
- [x] INF: Redis running locally (already running natively on 6379, not containerized)
- [x] INF: CompreFace running via docker-compose, admin UI reachable
- [ ] INF: CompreFace API key generated (manual step in the admin UI, needed for Phase 3)
- [x] INF: Anti-spoof service containerized and reachable
- [x] INF: ESLint + Prettier + TypeScript config shared across apps
- [x] INF: Husky pre-commit hook (lint + typecheck)

### Backend

- [x] BE: NestJS app scaffold, config module with schema-validated env loading (fail fast on missing vars)
- [x] BE: Prisma setup, connect to existing database, first migration
- [x] BE: Global exception filter and standard error response shape
- [x] BE: Request logging with correlation IDs
- [x] BE: Health endpoint (`/health`) reporting DB, Redis, CompreFace, anti-spoof status
- [x] BE: Swagger/OpenAPI enabled in non-production

### Frontend

- [x] FE: Next.js App Router scaffold, TypeScript strict mode
- [x] FE: Tailwind installed, theme wired to CSS custom properties
- [ ] FE: shadcn/ui components (deferred to Phase 1, when there are real forms to build)
- [x] FE: API client with typed fetch wrapper and error handling
- [ ] FE: Refresh-token retry in the API client (deferred to Phase 1, with auth)
- [x] FE: Base layout shells: super admin, tenant admin, kiosk
- [x] FE: Shared Zod schemas imported from `packages/shared`

### Deviations from the original plan

- **Ports changed:** web is on **3100** (3000 was occupied by another project) and
  Postgres is on **5436** (the existing pgvector instance), not 5432.
- **No class-validator.** Nest's global `ValidationPipe` was dropped in favour of a
  `ZodValidationPipe`, because member validation is generated at runtime from each
  tenant's field definitions and the web form runs the identical schema. Two
  validation systems would drift.
- **`NODE_ENV` removed from `.env`.** Both frameworks set it themselves; having it in
  the shared file broke `next build`.

---

## Phase 1 — Tenancy and authentication ✅ complete

Verified: 14 isolation and suspension tests passing, lint and typecheck clean,
full login flow exercised end to end through the portal origin.

### Backend

- [x] BE: `tenants`, `users`, `tenant_branding`, `tenant_settings`, `audit_logs` schema and migration
- [x] BE: Row Level Security policies on every tenant-owned table (see caveat below)
- [x] BE: Tenant context via `AsyncLocalStorage`, established by the auth guard from JWT claims
- [x] BE: Prisma extension that auto-injects `tenant_id` on all queries, failing closed
- [x] BE: Slug generator, validator, and reserved-name blocklist
- [x] BE: Auth module: login, refresh, logout, password hashing (argon2)
- [x] BE: Account lockout after repeated failed logins
- [x] BE: Role guard (super admin / org admin / operator)
- [x] BE: Tenant status guard (blocks writes when `suspended`)
- [x] BE: Super admin: create tenant, list tenants, update plan and `valid_until`, suspend, reactivate
- [x] BE: Public tenant-by-slug endpoint for branding the login page
- [x] BE: Audit log interceptor for all mutating admin actions
- [x] BE: Encrypted-at-rest helper (AES-256-GCM) for CompreFace API keys
- [x] BE: Super admin seed script
- [x] BE: **Test: cross-tenant access is refused** (the critical isolation test)
- [x] BE: Test: suspended tenant cannot write, can still read and export

### Frontend

- [x] FE: Next.js middleware for subdomain → tenant rewrite, reserved-slug handling
- [x] FE: API proxied through each portal's own origin, so cookies are first-party per tenant
- [x] FE: Login page (tenant-branded) and platform console login
- [x] FE: Auth session handling, protected route wrapper, role-based navigation
- [x] FE: Super admin console: tenant list, tenant detail, create tenant wizard
- [x] FE: Super admin: suspend / reactivate with typed confirmation
- [x] FE: Suspended-tenant banner
- [x] FE: 404 page for unknown subdomains
- [ ] FE: shadcn/ui (carried forward again: hand-rolled primitives cover Phase 1's forms)
- [ ] FE: Refresh-token retry in the API client (endpoint exists; client-side retry not wired)

### Important caveat on RLS

Postgres exempts a table's owner from its own policies unless `FORCE ROW LEVEL
SECURITY` is set, and the application connects as the owner. So the policies
constrain any _other_ role reaching the database (Adminer sessions, reporting
credentials) but **do not currently constrain the application itself**.

Application queries are isolated by the Prisma extension, which fails closed.
That is one enforced layer for application traffic, not the two the design calls
for. The migration documents the exact steps to close the gap, and it is
tracked as a known gap in PROJECT_DOCUMENTATION.md.

---

## Phase 2 — Members and dynamic fields

### Backend

- [ ] BE: `members`, `member_field_definitions` schema and migration, GIN index on `attributes`
- [ ] BE: Template seeder: education and corporate field definitions on tenant creation
- [ ] BE: Field definition CRUD (add, edit, reorder, toggle required, soft-delete)
- [ ] BE: Runtime Zod schema generator from field definitions
- [ ] BE: Member CRUD with dynamic validation against generated schema
- [ ] BE: Uniqueness constraint on `(tenant_id, code)`
- [ ] BE: CSV import: upload, column mapping, dry-run validation, row-level error report
- [ ] BE: CSV export of members
- [ ] BE: Consent capture fields written on enrollment
- [ ] BE: Test: changing a field definition does not break existing member records

### Frontend

- [ ] FE: Member list with search, filter by dynamic field, pagination
- [ ] FE: Dynamic form renderer driven by field definitions (text, number, date, select, phone, email)
- [ ] FE: Member create / edit / view pages
- [ ] FE: Field definition manager (drag to reorder, mark required, add custom field)
- [ ] FE: CSV import wizard with column mapping and an error preview table
- [ ] FE: Consent notice and checkbox in the enrollment flow

---

## Phase 3 — Face engine integration

### Backend

- [ ] BE: `face_templates` schema with `pgvector` column
- [ ] BE: CompreFace client service (create collection, add subject, add face, recognize, delete)
- [ ] BE: Auto-provision a CompreFace collection on tenant creation, with retry for half-failed setups
- [ ] BE: Storage module: `StorageService` interface, `LocalDiskStorage`, `S3Storage`, factory on `FILE_UPLOAD`
- [ ] BE: Signed-URL endpoint for image access, tenant-scoped and authenticated
- [ ] BE: Key naming scheme `tenants/<id>/<kind>/<yyyy>/<mm>/<uuid>.jpg`, UUID only, no client filenames
- [ ] BE: Enrollment endpoint: accept 3 to 5 images, validate, push to CompreFace, store embeddings
- [ ] BE: Re-enrollment and face deletion endpoints
- [ ] BE: Anti-spoof client service, returns score, honors `ANTISPOOF_MODE`
- [ ] BE: Recognition endpoint: device check → tenant status → anti-spoof → CompreFace → event write
- [ ] BE: Per-tenant confidence threshold applied at match time
- [ ] BE: Test: local and S3 drivers pass the same storage contract test suite
- [ ] BE: Test: images are not reachable without authentication

### Frontend

- [ ] FE: Camera component using `getUserMedia`, device selection, permission error states
- [ ] FE: MediaPipe in-browser detection: single face, size, brightness, frontal-pose gate
- [ ] FE: Live quality feedback overlay ("move closer", "too dark", "face not centered")
- [ ] FE: Enrollment capture flow: guided multi-angle capture with per-shot preview and retake
- [ ] FE: Frame downscaling to ~640px JPEG before upload
- [ ] FE: Enrolled-faces gallery on the member detail page, with delete and re-enroll

---

## Phase 4 — Kiosk and attendance capture

### Backend

- [ ] BE: `devices` schema, device registration and revocation endpoints
- [ ] BE: Device token issuing (one-time pairing code → long-lived token, hashed at rest)
- [ ] BE: Device auth guard on the recognition endpoint
- [ ] BE: `attendance_events` schema, append-only, with a DB-level guard against updates
- [ ] BE: Duplicate suppression using the per-tenant cooldown window
- [ ] BE: In/out direction logic (toggle on last event, or fixed by device role)
- [ ] BE: PIN fallback: member code + PIN endpoint, rate limited
- [ ] BE: Snapshot persistence rules (always for low confidence or high spoof score)
- [ ] BE: Socket gateway: per-tenant room, live attendance feed events

### Frontend

- [ ] FE: Kiosk page: full-screen, continuous scanning, large result card with name and photo
- [ ] FE: Kiosk device pairing screen (enter pairing code, store device token)
- [ ] FE: Success / failure / already-marked visual and audio feedback
- [ ] FE: PIN fallback mode on the kiosk
- [ ] FE: Kiosk wake-lock and auto-recovery when the camera stream drops
- [ ] FE: Live attendance feed on the admin dashboard via socket
- [ ] FE: Device management page: list, pair, rename, revoke, last-seen

---

## Phase 5 — Attendance engine

### Backend

- [ ] BE: `shifts`, `holidays`, `leaves`, `attendance_days` schema and migrations
- [ ] BE: Day materialization job: events + shift rules → first_in, last_out, minutes, status
- [ ] BE: Late / half-day / absent derivation using `late_grace_minutes`
- [ ] BE: Nightly job to close out days and mark absentees
- [ ] BE: Manual override endpoint, always writing an `audit_logs` entry
- [ ] BE: Recompute endpoint for when shift or holiday config changes retroactively
- [ ] BE: Nightly snapshot retention job (rolling delete, exempting flagged snapshots)
- [ ] BE: Test: correcting a shift retroactively recomputes days without touching events

### Frontend

- [ ] FE: Shift configuration page (timings, working days, grace period)
- [ ] FE: Holiday calendar management
- [ ] FE: Leave entry (manual, no approval workflow in v1)
- [ ] FE: Daily attendance view: present, absent, late, with member photos
- [ ] FE: Manual override UI with a mandatory reason field
- [ ] FE: Attendance settings page (confidence threshold, cooldown, retention days)

---

## Phase 6 — Dashboards and reports

### Backend

- [ ] BE: Dashboard aggregate endpoints (today's counts, weekly trend, late trend, top absentees)
- [ ] BE: Member attendance history endpoint with date range
- [ ] BE: Monthly report / muster roll endpoint
- [ ] BE: CSV export for daily, monthly and per-member reports
- [ ] BE: PDF export for the monthly report
- [ ] BE: Super admin platform metrics (tenants by status, events per day, storage used)

### Frontend

- [ ] FE: Tenant admin dashboard: KPI tiles, attendance trend chart, live feed
- [ ] FE: Reports page with date range picker and filters by dynamic field (class, department)
- [ ] FE: Member attendance history view with a calendar heatmap
- [ ] FE: Export buttons (CSV, PDF) with progress state
- [ ] FE: Super admin platform dashboard

---

## Phase 7 — Billing lifecycle and notifications

### Backend

- [ ] BE: BullMQ setup, repeatable reminder jobs at T-7, T-3, T-1, T+1 relative to `valid_until`
- [ ] BE: Email service integration and templates (reminder, overdue, suspended, reactivated, welcome)
- [ ] BE: Auto-transition `active` → `past_due` → `suspended` on schedule
- [ ] BE: Super admin manual reminder trigger
- [ ] BE: Socket notification on status change to the tenant room
- [ ] BE: Email delivery logging and failure retry
- [ ] BE: Test: suspension blocks capture but preserves read and export

### Frontend

- [ ] FE: Billing / subscription page for the tenant admin (plan, next due date, history)
- [ ] FE: Past-due and suspended banners with a clear call to action
- [ ] FE: In-app notification center fed by socket
- [ ] FE: Super admin: send reminder action, view delivery status

---

## Phase 8 — Branding and second template

### Backend

- [ ] BE: Branding CRUD endpoint, gated by the `custom_branding_enabled` plan flag
- [ ] BE: Logo upload through `StorageService` with size and type validation
- [ ] BE: Public tenant-theme endpoint consumed by the Next.js server layout

### Frontend

- [ ] FE: Server-render CSS custom properties in the root layout (no flash of unbranded content)
- [ ] FE: Audit every component for hardcoded colors, replace with theme tokens
- [ ] FE: Branding settings page with live preview and color pickers
- [ ] FE: Education theme (bright, high-contrast)
- [ ] FE: Corporate theme (clean, professional)
- [ ] FE: Template switcher validated against both themes

---

## Cross-cutting

### Security

- [ ] Rate limiting on auth, recognition and PIN endpoints
- [ ] Helmet, CORS allowlist, CSRF protection where relevant
- [ ] Secrets never logged; face images never logged
- [ ] Dependency vulnerability scan in CI
- [ ] Penetration pass on tenant isolation before the first customer

### Compliance

- [ ] Consent notice text drafted and versioned
- [ ] Privacy policy and DPA template
- [ ] Data deletion endpoint (member and full tenant)
- [ ] "Store embedding only, discard photo" tenant option
- [ ] Retention settings surfaced in the admin UI

### Testing

- [ ] Unit tests on tenant scoping, dynamic validation, day materialization
- [ ] Integration tests on the isolation boundary (the highest-value tests in this project)
- [ ] Storage contract tests running against both drivers
- [ ] E2E: register tenant → enroll member → scan → verify day record
- [ ] Load test on the recognition endpoint (target: sustained 1 rps per tenant with bursts to 5)

### DevOps

- [ ] Dockerfiles for api and web
- [ ] Full docker-compose (api, web, postgres, redis, compreface, antispoof, adminer)
- [ ] CI: lint, typecheck, test, build
- [ ] Staging deployment with wildcard DNS and wildcard TLS
- [ ] Backup strategy covering both Postgres and the uploads directory
- [ ] Error tracking (Sentry) and uptime monitoring

### Documentation

- [ ] README with local setup steps
- [ ] API documentation published from Swagger
- [ ] Admin user guide
- [ ] Kiosk setup guide with recommended hardware

---

## Decisions to confirm before Phase 0

- [ ] Kiosk tablet model confirmed (assumed) rather than per-person phones
- [ ] Education template ships first (assumed)
- [ ] First customers in India (assumed) — determines v1 compliance scope
- [ ] Production domain chosen
- [ ] Email provider chosen
- [ ] Anti-spoof ships in log-only mode in v1 (assumed)
