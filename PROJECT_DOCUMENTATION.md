# Face-Cam — Project Documentation

A running record of what has actually been built, updated at the end of every
phase and whenever a notable feature lands.

## How this fits with the other documents

| Document                                           | Answers                            | Tense           |
| -------------------------------------------------- | ---------------------------------- | --------------- |
| [PROJECT_DESCRIPTION.md](./PROJECT_DESCRIPTION.md) | What are we building and why       | Intended design |
| [CHECKLIST.md](./CHECKLIST.md)                     | What work is left                  | Task tracker    |
| **PROJECT_DOCUMENTATION.md**                       | What exists today and how it works | As-built        |
| [README.md](./README.md)                           | How do I run it                    | Setup           |

The distinction that matters: PROJECT_DESCRIPTION is the plan and can describe
things that do not exist yet. **This file only describes code that is written,
running and verified.** If something here turns out to be aspirational, it is a
bug in the document.

## Conventions for entries

Every entry follows the same shape, in this order:

1. **Summary** — one paragraph, what this phase or feature delivers
2. **What was built** — the concrete pieces, grouped backend / frontend / infra
3. **Key files** — where to look, with a one-line purpose each
4. **Decisions and why** — choices a future reader would otherwise re-litigate
5. **How to verify** — commands that prove it works, with expected output
6. **Known gaps** — what is deliberately missing, and when it lands

Rule for section 4: record the **reasoning**, not just the choice. "We used
Zod" is not useful in six months. "We used Zod because member schemas are
generated per tenant at runtime and the web form runs the identical schema" is.

Rule for section 6: state gaps plainly. A known gap that is written down is a
plan. The same gap left undocumented is a surprise during a customer demo.

---

# Phase 0 — Foundation

**Status:** complete · **Date:** 18 August 2026

## Summary

Established the monorepo, the running skeletons of both applications, the
database with its first migration, and the supporting Docker services. Nothing
in this phase is a product feature. It exists so that Phase 1 can be written
against a working, verifiable base rather than against a scaffold that has
never been booted.

Everything described below was started and checked, not just written.

## What was built

### Infrastructure

- pnpm workspace with `apps/api`, `apps/web` and `packages/shared`
- Docker Compose project `facecam`: CompreFace 1.2.0 (five containers) plus the
  anti-spoof service
- Shared ESLint, Prettier and TypeScript configuration
- Husky pre-commit hook running lint-staged and typecheck
- Single root `.env` consumed by both applications through `dotenv-cli`

### Backend (`apps/api`, NestJS)

- **Config module** validating every environment variable with Zod at boot. The
  process refuses to start on a bad config and prints a readable report rather
  than a stack trace.
- **Request context** built on `AsyncLocalStorage`, already carrying the
  `tenantId` slot that Phase 1's Prisma extension will read.
- **Correlation IDs** stamped on every request and echoed in the
  `x-correlation-id` response header.
- **Global exception filter** producing one error envelope for every failure,
  including Zod validation errors mapped to field-level `details`.
- **Request logging** that records method, path, status, duration, correlation
  ID and tenant, and deliberately never logs request or response bodies.
- **Health endpoint** probing Postgres, Redis, CompreFace and anti-spoof
  independently.
- **Swagger** at `/api/docs`, non-production only.
- **Prisma** connected, with the first migration applied.

### Frontend (`apps/web`, Next.js 15 App Router)

- **Subdomain middleware** resolving `<slug>.<ROOT_DOMAIN>` to the internal
  `/t/[slug]` route tree
- **Theme system** where every Tailwind colour resolves to a CSS custom
  property, so no component holds a literal colour
- **Typed API client** that parses the backend error envelope into an `ApiError`
  carrying `code`, `details` and `correlationId`
- **Layout shells** for the super admin console, the tenant portal and the kiosk

### Shared (`packages/shared`)

- Enums mirroring the Prisma schema
- Reserved subdomain blocklist and the host-to-slug resolver
- Education and corporate field templates
- `buildMemberSchema`, the runtime Zod generator used by both applications

## Key files

| File                                                   | Purpose                                          |
| ------------------------------------------------------ | ------------------------------------------------ |
| `apps/api/src/config/env.schema.ts`                    | Environment validation, fails fast               |
| `apps/api/src/common/context/request-context.ts`       | AsyncLocalStorage tenant and correlation context |
| `apps/api/src/common/filters/all-exceptions.filter.ts` | Single error envelope                            |
| `apps/api/src/common/pipes/zod-validation.pipe.ts`     | Per-route Zod validation                         |
| `apps/api/src/health/health.service.ts`                | Dependency probes                                |
| `apps/api/prisma/schema.prisma`                        | Database schema                                  |
| `apps/web/src/middleware.ts`                           | Subdomain to tenant routing                      |
| `apps/web/src/lib/theme.ts`                            | Branding to CSS custom properties                |
| `apps/web/tailwind.config.ts`                          | Theme tokens, no literal colours                 |
| `packages/shared/src/field-schema.ts`                  | Runtime Zod schema generator                     |
| `packages/shared/src/slug.ts`                          | Slug rules and host resolution                   |
| `docker/docker-compose.yml`                            | CompreFace and anti-spoof stack                  |

## Database

Database `facecam_db` on the existing pgvector instance, port **5436**, with the
`vector` and `pgcrypto` extensions enabled.

Migration `20260818034733_init_tenancy` creates:

| Table             | Holds                                                                    |
| ----------------- | ------------------------------------------------------------------------ |
| `tenants`         | Organization, slug, status, plan, `valid_until`, CompreFace linkage      |
| `tenant_branding` | Logo, colours, font, `custom_branding_enabled` plan flag                 |
| `tenant_settings` | Confidence threshold, spoof threshold, cooldown, retention, grace period |
| `users`           | Super admin, org admin and operator accounts                             |
| `audit_logs`      | Actor, action, entity, metadata, correlation ID                          |

Two schema choices worth knowing:

- `users.email` is unique **per tenant**, not globally, because the same person
  may administer two organizations with one address.
- `tenants.timezone` exists so attendance day boundaries are computed in the
  organization's zone, never the server's. Getting this wrong silently corrupts
  every late and absent calculation.

## Decisions and why

### Zod instead of class-validator

Nest's global `ValidationPipe` was removed. Member validation is generated at
runtime from each tenant's field definitions, and the web form runs that exact
same schema from `packages/shared`. Adding a second, decorator-based validation
system would guarantee eventual disagreement between what the API accepts and
what the form allows.

### Tenant identity comes from the hostname, never the path

`apps/web/src/middleware.ts` rewrites `acme.localhost:3100/x` to `/t/acme/x`,
and a direct request to `/t/acme` returns 404. If the path were authoritative, a
tenant admin could reach another tenant's portal by editing the URL.

### Health reports degraded, not down, when a face engine is missing

A dead database returns 503, since nothing works without it. A dead CompreFace
returns 200 with `status: degraded`, because dashboards, reports and the admin
console remain fully usable. Returning 503 there would make a load balancer
evict a mostly-healthy instance during a CompreFace restart.

### Bodies are never logged

Request and response bodies carry face images and personal data. The logging
interceptor records only method, path, status, duration, correlation ID and
tenant.

### Anti-spoofing returns null rather than a fabricated score

The service runs and answers its health check but ships without model weights.
It reports `ready: false` and returns `spoofScore: null`. Returning a
plausible-looking number would make the dashboard and every demo appear to have
working liveness detection while providing none, which is worse than an obvious
gap. See `docker/antispoof/README.md`.

### CompreFace does not store face images

`SAVE_IMAGES_TO_DB` defaults to false, so CompreFace keeps only embeddings.
Face-Cam owns the single copy of every image, which is what makes the retention
job, the per-tenant `storeEmbeddingOnly` option and deletion requests
meaningful. A second permanent copy inside CompreFace would sit outside all
three, and "we deleted it" has to be true of every copy.

The visible cost is that CompreFace's own Subjects screen shows blank
thumbnails. That is expected, not a failed upload. See PROJECT_DESCRIPTION.md
section 16.

## How to verify

```bash
pnpm docker:up
pnpm --filter @facecam/shared build
pnpm db:migrate
pnpm dev
```

Then:

```bash
# Health: every dependency reported separately
curl -s http://localhost:4000/health

# Apex routes
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/          # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/admin     # 200

# Tenant isolation: the internal path must not be reachable directly
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/t/acme    # 404

# Subdomain resolves, then 404s because no tenant exists yet
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Host: acme.localhost:3100" http://localhost:3100/                  # 404

# Quality gates
pnpm -r typecheck
pnpm -r lint
```

Recorded results at the close of Phase 0: all four dependencies `up`, routes as
annotated above, typecheck and lint clean across all three packages.

## Environment notes

| Service    | Port | Note                                              |
| ---------- | ---- | ------------------------------------------------- |
| Web        | 3100 | 3000 was occupied by another project              |
| API        | 4000 |                                                   |
| Postgres   | 5436 | Existing pgvector instance, database `facecam_db` |
| Redis      | 6379 | Already running natively, not containerized       |
| CompreFace | 8000 |                                                   |
| Anti-spoof | 8081 |                                                   |

**Apple Silicon:** CompreFace publishes amd64-only images and runs under
emulation. The ND4J "Generic x86 binary" warning in its logs is expected and
harmless. Recognition latency on this machine is not representative. Benchmark
throughput on x86 before making any performance claim.

## Known gaps

| Gap                                                    | Lands in                                  |
| ------------------------------------------------------ | ----------------------------------------- |
| No authentication of any kind                          | Phase 1                                   |
| No Row Level Security policies yet                     | Phase 1                                   |
| Tenant portals 404 because no tenant endpoint exists   | Phase 1                                   |
| Prisma tenant-scoping extension not written            | Phase 1                                   |
| shadcn/ui not installed                                | Phase 1, with the first real forms        |
| Refresh-token retry missing from the API client        | Phase 1, with auth                        |
| Anti-spoof has no model weights                        | Before enforce mode, see Phase 4          |
| CompreFace API key must be generated by hand in its UI | Manual, needed for Phase 3                |
| No tests                                               | Phase 1, starting with the isolation test |

The most important of these is Row Level Security. Until it exists, tenant
isolation rests on application code alone, which is exactly the single point of
failure the two-layer design in PROJECT_DESCRIPTION.md section 4 is meant to
avoid.

---

# Phase 1 — Tenancy and authentication

**Status:** complete · **Date:** 18 August 2026

## Summary

The platform now has real tenants, real accounts, and an enforced boundary
between organizations. A super admin can register an organization, which
provisions its portal and first administrator together; that administrator can
sign in only at their own portal; and the super admin can suspend service
without taking any data away.

The boundary is asserted by 14 tests that probe it from the outside over HTTP,
the way an attacker would.

## What was built

### Isolation

- **Prisma extension** (`src/prisma/tenant-scope.ts`) that injects `tenantId`
  into every query against a tenant-owned model. It **fails closed**: with no
  tenant in context and no explicit platform scope, the query throws.
- **`RequestContext.asPlatform()`**, the single, greppable opt-out used by super
  admin code paths. It restores the previous scope in a `finally`, so a failed
  platform query cannot leave the rest of a request unscoped.
- **Row Level Security** policies on all four tenant-owned tables, plus a
  `current_tenant_id()` function that returns NULL when unset, so an unset
  context matches no rows.

### Authentication

- Argon2id password hashing.
- Access and refresh JWTs, signed with **different secrets**, delivered as
  httpOnly cookies. The refresh cookie is scoped to `/api/auth`, so the
  long-lived credential is not attached to ordinary API calls.
- `tokenVersion` on the user row; bumping it invalidates every outstanding
  session, which is what makes "sign out everywhere" real.
- Account lockout after 5 failed attempts, for 15 minutes.
- Constant-work comparison against a dummy hash when an account is not found.

### Authorization

- **AuthGuard** (global), **RolesGuard**, **TenantStatusGuard**, applied in that
  order. Authentication is global, so a new endpoint is protected unless
  someone writes `@Public()`.
- **AuditInterceptor** recording actor, action, entity, IP, user agent and
  correlation ID for routes marked `@Audited`.
- **EncryptionService** (AES-256-GCM) for CompreFace API keys at rest.

### Tenants

- Create (organization + branding + settings + first admin, in one transaction),
  list, read, update, suspend, reactivate.
- Slug generation with the reserved blocklist and automatic numeric suffixing,
  so two schools with the same name can both register unattended.
- Public tenant-by-slug endpoint serving only what the login page needs.

### Frontend

- API calls proxied through each portal's own origin.
- Branded portal login and platform console login, sharing one form component.
- Server-side session helpers, protected `/admin` layout with the role check in
  one place, tenant list, creation wizard, detail page.
- Suspend flow requiring a reason and a typed organization name; reactivation is
  a single click.

## Key files

| File                                                | Purpose                                        |
| --------------------------------------------------- | ---------------------------------------------- |
| `apps/api/src/prisma/tenant-scope.ts`               | Fail-closed tenant scoping for every query     |
| `apps/api/src/common/context/request-context.ts`    | Tenant context and the `asPlatform` opt-out    |
| `apps/api/src/common/guards/auth.guard.ts`          | Token verification, tenant context from claims |
| `apps/api/src/common/guards/tenant-status.guard.ts` | Suspension policy                              |
| `apps/api/src/auth/auth.service.ts`                 | Login, refresh, lockout, portal-scoped lookup  |
| `apps/api/src/tenants/tenants.service.ts`           | Tenant lifecycle and slug allocation           |
| `apps/api/test/tenant-isolation.e2e-spec.ts`        | The boundary tests                             |
| `apps/web/src/lib/session.ts`                       | Server-side session resolution                 |
| `apps/web/next.config.mjs`                          | API proxy per portal origin                    |

## Decisions and why

### The tenant comes from the token, never from the request

A caller can change the hostname or forge a header; they cannot change a signed
claim. So `tenantId` is read from the JWT and nothing else. There is no
"which portal is this" versus "who is this" mismatch to reconcile, and no way to
act on another organization by editing a request. A test asserts that a forged
`Host` header does not change the tenant a token acts for.

### Scoping fails closed, not open

The obvious design injects a tenant filter when a tenant is present and skips it
otherwise. That turns any bug in context propagation into a silent cross-tenant
read. Instead, a missing context is an exception. Platform-wide access requires
`asPlatform()`, which is deliberate and easy to audit.

### Credentials are confined to one portal

`users.email` is unique per tenant, not globally, and login is scoped by
`tenantSlug`. One person administering two organizations has two accounts. An
admin's credentials are rejected at another organization's portal, and rejected
at the platform console, both tested.

### Unknown portal and wrong password return identical responses

Otherwise the login endpoint becomes an oracle for which organizations are
registered on the platform. A test compares the two responses field by field.

### Cross-tenant reads return "not found", not "forbidden"

403 confirms the record exists. Because the tenant filter is part of the `where`
clause, another tenant's row is simply not there.

### API calls are proxied through the portal's own origin

The browser talks to `acme.localhost:3100/api`, which Next forwards to the
backend. This removes CORS preflights, makes auth cookies first-party to the
portal so SameSite behaviour is never in doubt, and gives **each subdomain its
own cookie jar**, so a session for one portal is not even transmitted to
another.

### Suspension pauses service without withdrawing data

Writes are blocked; reads, dashboards and exports keep working; nothing is
deleted. Locking a school out of its own attendance history over an unpaid
invoice causes damage far out of proportion to the debt. Four tests pin this
behaviour, including that a super admin can still act on a suspended tenant.

### `tokenVersion` is checked on refresh, not on every request

Checking it per request would add a database round-trip to every call. The
access token's short lifetime bounds how long a revoked session survives.

### Prisma and shared enums use identical string values

Prisma generates `'ACTIVE'` for a member named `ACTIVE`, while the shared enums
use `'active'`. Comparing them silently fails. The Prisma enum members were
renamed to the lowercase values so both sides produce the same strings, rather
than converting at every boundary. The database labels were already lowercase,
so this needed no migration.

## How to verify

```bash
pnpm docker:up
pnpm db:migrate
pnpm db:seed          # creates admin@facecam.local
pnpm dev
```

```bash
pnpm --filter @facecam/api test:e2e   # 14 tests, isolation and suspension
pnpm -r typecheck && pnpm -r lint
```

Manually: sign in at `http://localhost:3100/login`, register an organization,
then confirm its administrator can sign in at
`http://<slug>.localhost:3100/login` and **cannot** sign in at the apex or at
another organization's portal.

The tests use a separate `facecam_test_db`, never the development database.

## Known gaps

| Gap                                                    | Notes                                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RLS does not constrain the application itself**      | The app connects as the table owner, which Postgres exempts from policies unless FORCE is set. Application isolation currently rests on the Prisma extension alone. The migration documents the switch-over. **The most important gap in the project.** |
| Refresh-token retry not wired in the web client        | The endpoint works; the browser does not yet retry a 401 automatically, so sessions end at the access-token lifetime                                                                                                                                    |
| No password reset or user invitation flow              | Administrators are created with a temporary password handed over out of band                                                                                                                                                                            |
| Org admins cannot yet manage their own staff accounts  | Only the first admin exists per tenant                                                                                                                                                                                                                  |
| shadcn/ui still not installed                          | Hand-rolled primitives cover the current forms                                                                                                                                                                                                          |
| Tenant branding is stored but not editable             | The editor is Phase 8                                                                                                                                                                                                                                   |
| CompreFace collection not provisioned on tenant create | Marked with a TODO in `TenantsService.create`, lands in Phase 3                                                                                                                                                                                         |

### One footgun worth knowing

A `PrismaPromise` is lazy: it executes when awaited, not when created. Awaiting
it outside the `RequestContext.run()` scope that set the tenant runs the query
after the context is gone, and the extension then correctly refuses it. Real
requests are wrapped end to end by the correlation-id middleware, so this only
appears in tests and background jobs. Await inside the scope.

---

<!--
Template for the next entry. Copy, fill in, delete this comment.

# Phase N — Name

**Status:** complete · **Date:** DD Month YYYY

## Summary
## What was built
### Backend
### Frontend
### Infrastructure
## Key files
## Decisions and why
## How to verify
## Known gaps
-->
