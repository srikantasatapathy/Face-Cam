# Face-Cam — Multi-Tenant Face Recognition Attendance System

> Status: Phase 0 complete, Phase 1 next. This document is the agreed specification.
> Companion documents: [CHECKLIST.md](./CHECKLIST.md) for tasks, [README.md](./README.md) for setup.

---

## 1. Overview

Face-Cam is a web based, multi-tenant attendance platform. An organization (school,
college, or company) registers under a super admin, gets its own portal URL, enrolls
its members, and takes attendance by scanning faces through a browser camera. No
desktop software is installed by the customer.

The product is sold as a subscription. The super admin can suspend a tenant remotely
when payment is not received, and can send reminders by email and in-app socket.

### Value proposition

- No software install. A browser and a camera are enough.
- Onboarding in minutes: register organization, pick a template, import members, start scanning.
- One platform serving both education and corporate verticals through templates.
- Optional white-label branding as a paid upgrade.

---

## 2. Roles

| Role                            | Scope      | Capabilities                                                                                                                                                   |
| ------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Super Admin**                 | Platform   | Create/approve tenants, set plans and due dates, suspend or reactivate, send reminders, view platform-wide metrics, impersonate a tenant for support (audited) |
| **Org Admin**                   | One tenant | Full control of their portal: members, field definitions, devices, shifts, holidays, branding, reports, staff accounts                                         |
| **Operator / Staff**            | One tenant | Runs the attendance kiosk, marks manual overrides, views daily attendance. Cannot edit tenant settings                                                         |
| **Member** (student / employee) | Self       | Enrolled subject. No login in v1. Read-only self portal is a future scope item                                                                                 |

---

## 3. Verticals and templates

A tenant picks a **template** at registration. The template seeds the member field
definitions and the UI theme. Both are editable afterwards.

### Education template

Bright, friendly, high-contrast UI.

Member fields: `full_name` (required), `roll_number` (required, unique per tenant),
`class`, `section`, `admission_number`, `date_of_birth`, `gender`, `blood_group`,
`guardian_name`, `guardian_phone`, `email`, `address`.

### Corporate template

Clean, professional, restrained UI.

Member fields: `full_name` (required), `employee_code` (required, unique per tenant),
`department`, `designation`, `email`, `phone`, `date_of_joining`, `reporting_manager`,
`work_location`, `employment_type`.

### Required vs optional policy

Only two fields are enforced by the platform: `full_name` and a tenant-unique member
`code` (roll number or employee code). Everything else, including email and phone, is
optional by default and can be made required per tenant by the org admin. Rationale:
many school students have no email address, and forcing it blocks onboarding.

---

## 4. Tenancy model

**Strategy: shared database, shared schema, `tenant_id` on every tenant-owned table,
enforced by Postgres Row Level Security.**

- Tenant resolved once per request from the subdomain, stored in `AsyncLocalStorage`,
  and applied automatically by the ORM layer. No query relies on a developer
  remembering to add a `tenant_id` filter.
- RLS is the backstop, not the primary control. Both layers must be present.
- Cross-tenant access returns **404**, never 403, so existence is not leaked.
- A large tenant can be promoted to a dedicated database later without an application
  rewrite. This is deliberately deferred.

### Portal URL

`https://<slug>.facecam.app` (production domain TBD).

- Requires wildcard DNS plus a wildcard TLS certificate (DNS-01 with Let's Encrypt, or
  Cloudflare in front).
- Slug is generated from the organization name, validated, and frozen after issue.
- Reserved slug blocklist: `www`, `api`, `admin`, `app`, `mail`, `static`, `assets`,
  `superadmin`, `support`, `status`, `docs`.
- Local development uses `<slug>.localhost:3100`, which resolves without host-file edits
  in modern browsers. Requesting the internal `/t/<slug>` path directly returns 404, so
  the hostname check cannot be bypassed by editing the URL.

---

## 5. Tech stack

| Layer                | Choice                                 | Notes                                         |
| -------------------- | -------------------------------------- | --------------------------------------------- |
| Frontend             | Next.js (App Router, TypeScript)       | Subdomain routing via middleware              |
| UI                   | Tailwind CSS + shadcn/ui               | Theme driven by CSS custom properties         |
| Backend              | NestJS (TypeScript)                    | REST + Socket.IO                              |
| ORM                  | Prisma                                 | With a tenant-scoping extension               |
| Database             | PostgreSQL + pgvector                  | Already provisioned by the team, with Adminer |
| Cache / queue        | Redis + BullMQ                         | Sessions, reminder jobs, socket adapter       |
| Face engine          | CompreFace (Apache 2.0, Docker)        | One face collection per tenant                |
| Anti-spoof           | MiniFASNet / Silent-Face-Anti-Spoofing | Separate small container, log-only in v1      |
| In-browser detection | MediaPipe Face Detection               | Pre-filters frames before upload              |
| Storage              | Local disk **or** AWS S3               | Selected by `FILE_UPLOAD` env var             |
| Email                | Provider TBD (Resend / SES / Postmark) | Reminders and notifications                   |

### Repository layout

```
Face-Cam/
├── apps/
│   ├── api/          NestJS backend
│   └── web/          Next.js frontend
├── packages/
│   └── shared/       Shared TypeScript types and Zod schemas
├── docker/
│   ├── compreface/   docker-compose for CompreFace
│   └── antispoof/    Anti-spoof service
├── uploads/          Local file storage (gitignored, used when FILE_UPLOAD=local)
├── PROJECT_DESCRIPTION.md
└── CHECKLIST.md
```

Managed as a pnpm workspace.

---

## 6. Face recognition pipeline

### Enrollment

1. Org admin opens the member's enrollment page and captures 3 to 5 photos at
   different angles and lighting conditions.
2. Browser validates each frame with MediaPipe: exactly one face, adequate size,
   adequate brightness, roughly frontal.
3. Frames are uploaded to the backend.
4. Backend adds each image to the tenant's CompreFace collection as a subject.
5. Backend also requests the embedding and stores it in Postgres via `pgvector`,
   alongside the CompreFace subject ID.

**Why store our own embeddings:** it keeps the face engine replaceable. If CompreFace
is outgrown or replaced with a GPU InsightFace service, members do not have to be
re-enrolled.

### Recognition

1. Kiosk page runs continuous in-browser detection. It only uploads a frame when the
   quality gate passes. This removes most server load and gives instant user feedback.
2. Frame is posted as a ~640px JPEG to the backend along with the device token.
3. Backend verifies the device is registered and the tenant is active.
4. Backend calls the anti-spoof service and records the score.
5. Backend calls CompreFace `/recognize` against the tenant's collection.
6. If confidence is above the tenant threshold, an `attendance_event` is written.
7. Result is returned to the kiosk, which shows the member's name and photo for
   confirmation.

### Fallback identification

Every kiosk has a manual mode: enter member code plus a PIN. This ships in v1. It is
the difference between "the system is broken" and "the system had a hiccup" when the
camera, the lighting, or the network misbehaves.

---

## 7. Anti-spoofing

CompreFace has no liveness detection. A printed photo or a phone screen will be
recognized as the real person. Login credentials do not mitigate this, because the
kiosk is authenticated once in the morning and then runs unattended all day. The attack
happens in front of an already-authenticated camera.

### Phased plan

**Phase 1 (v1): log-only.**
`spoof_score` is recorded on every `attendance_event`. Nothing is rejected. This
collects real-world data with zero risk of false rejections annoying customers.

**Phase 2: enforce.**
A per-tenant `reject_spoof_above` threshold, configurable from the admin panel and
disabled by default. Enabled once the Phase 1 data shows a safe threshold.

**Additional controls shipping in v1:**

- **Device binding.** Only registered kiosk devices holding a valid device token can
  post attendance. An employee cannot open the URL from home and scan.
- **Duplicate suppression.** The same member cannot be recorded twice within a
  configurable cooldown window.
- **Low-confidence snapshots.** Every event below the confidence threshold, or above
  the spoof score, keeps its image for admin review.

---

## 8. Storage strategy

Storage backend is selected by a single environment variable, per the team decision.

```env
FILE_UPLOAD=local          # local | aws
LOCAL_UPLOAD_DIR=./uploads # used when FILE_UPLOAD=local
AWS_REGION=
AWS_S3_BUCKET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

Both backends sit behind one interface, so switching is a config change and never a
code change:

```ts
interface StorageService {
  put(key: string, buffer: Buffer, mime: string): Promise<void>
  getSignedUrl(key: string, ttlSeconds: number): Promise<string>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}
```

`LocalDiskStorage` writes under `LOCAL_UPLOAD_DIR`. `S3Storage` writes to the bucket.
The factory reads `FILE_UPLOAD` at boot and fails fast if the selected driver is
missing required variables.

### Rules that apply to both drivers

1. **Face images are never served from a public path.** Not from `web/public`, not from
   a static-file mount. They are biometric records. Access is only through an
   authenticated, tenant-scoped endpoint or a short-lived signed URL.
2. **Keys are UUID-based and sharded**: `tenants/<tenant_id>/<kind>/<yyyy>/<mm>/<uuid>.jpg`.
   No user-supplied filenames. No trusting the client's content type.
3. **When `FILE_UPLOAD=local`, the directory must be a Docker volume mount.** Otherwise
   every redeploy erases it. Local disk also breaks the moment a second API instance
   runs, which is an accepted v1 limitation.
4. **The Postgres dump alone is not a full backup** under the local driver. The uploads
   directory must be backed up alongside it.

### Retention policy

Attendance snapshots are the storage problem, not enrollment photos.
Rough numbers: 500 events per day at ~100KB is about 18GB per tenant per year.

- **Enrollment photos:** retained for the life of the member record.
- **Attendance snapshots:** rolling delete after 30 days by default, configurable per
  tenant. Snapshots flagged as low-confidence or high-spoof-score are exempt until
  reviewed.

A nightly BullMQ job performs the deletion. This cuts storage by roughly 90 percent and
is also a defensible privacy position with customers.

**Migration path:** local disk in v1 → MinIO in docker-compose when a second server
appears → AWS S3 or Cloudflare R2 when scale or data residency demands it. All three
speak the same interface.

---

## 9. Data model

Core tables. Every tenant-owned table carries `tenant_id` and is covered by RLS.

### Platform

- **tenants** — id, name, slug, template (`education` | `corporate`), status
  (`trial` | `active` | `past_due` | `suspended` | `cancelled`), plan, `valid_until`,
  compreface_collection_id, compreface_api_key (encrypted), timezone, created_at
- **tenant_branding** — tenant_id, logo_url, primary_color, secondary_color,
  accent_color, font, login_bg_url, custom_branding_enabled
- **tenant_settings** — tenant_id, confidence_threshold, reject_spoof_above,
  duplicate_cooldown_seconds, snapshot_retention_days, late_grace_minutes
- **users** — id, tenant_id (null for super admin), email, password_hash, role, status
- **audit_logs** — id, tenant_id, actor_user_id, action, entity, entity_id, metadata, created_at

### Members

- **members** — id, tenant_id, code, full_name, email, phone, status, photo_ref,
  consent_at, consent_version, attributes `JSONB` (GIN indexed)
- **member_field_definitions** — tenant_id, key, label, type, required, options,
  group, sort_order
- **face_templates** — id, tenant_id, member_id, compreface_subject_id,
  embedding `vector`, image_ref, created_at

Dynamic fields live in `members.attributes`. A Zod schema is generated at runtime from
`member_field_definitions` and shared by the Nest validator and the Next form, so
validation cannot drift between the two.

### Attendance

- **attendance_events** — id, tenant_id, member_id, occurred_at, direction
  (`in` | `out`), source (`face` | `pin` | `manual`), device_id, confidence,
  spoof_score, image_ref. **Append-only. Never updated, never deleted.**
- **attendance_days** — tenant_id, member_id, date, first_in, last_out, minutes,
  status (`present` | `absent` | `late` | `half_day` | `holiday` | `leave`),
  overridden_by, override_reason. Materialized from events plus shift rules.
- **devices** — id, tenant_id, name, device_token_hash, location, last_seen_at, status
- **shifts** — tenant_id, name, start_time, end_time, grace_minutes, working_days
- **holidays** — tenant_id, date, name
- **leaves** — tenant_id, member_id, from_date, to_date, type, approved_by

**Why events and days are separate:** late policies, half days, multiple shifts,
corrections and audits all need the raw signal. A single `present` boolean is
unrecoverable the first time an admin needs to correct a record and someone later
disputes it. Manual overrides write to `attendance_days` and always leave an
`audit_logs` entry.

---

## 10. Billing and suspension

Tenant `status` and `valid_until` are enforced by a global Nest guard on every request
and re-checked when a socket connects.

**Suspension is graceful, never destructive:**

| Capability            | active          | past_due        | suspended       |
| --------------------- | --------------- | --------------- | --------------- |
| Attendance capture    | yes             | yes             | **blocked**     |
| Member enrollment     | yes             | yes             | **blocked**     |
| Dashboard and reports | yes             | yes             | read-only       |
| Data export           | yes             | yes             | yes             |
| Payment page          | yes             | yes             | yes             |
| Data deletion         | never automatic | never automatic | never automatic |

Locking a school out of its own attendance history produces chargebacks and reputation
damage. Data is retained through suspension and cancellation until an explicit deletion
request.

**Reminders:** BullMQ repeatable jobs fire at T-7, T-3, T-1 and T+1 days relative to
`valid_until`. Email is the source of truth. The Socket.IO in-app banner (per-tenant
room) is cosmetic and must never be the only notice.

**Payment gateway:** deferred to a later phase. When added, gateway webhooks should
drive `valid_until` rather than manual date tracking.

---

## 11. Branding

Branding lives in the **database**, not in a config file. A config file would require a
redeploy per customer, which makes paid white-labeling impossible to operate.

- `tenant_branding` holds logo, colors, font and background.
- Values are rendered as CSS custom properties in the server-rendered root layout, so
  there is no flash of unbranded content.
- Tailwind's theme reads from those variables. Components never hardcode a color.
- A defaults file per template (education, corporate) supplies the base values that a
  tenant overrides.
- `custom_branding_enabled` is a plan flag. Premium branding becomes a billing change,
  not an engineering ticket.

---

## 12. Security and compliance

Face templates are **biometric data**, a special category under India's DPDP Act, GDPR
Article 9, and US state laws such as Illinois BIPA (which carries statutory per-violation
damages). Several EU regulators have fined schools specifically for face recognition
attendance, on the grounds that student consent is not freely given.

Built in from day one, because retrofitting is expensive:

- **Consent capture at enrollment**: who consented, when, and which version of the
  notice. Stored on the member record.
- **Configurable retention** and hard delete on request.
- **Option to store only the embedding** and discard the raw enrollment photo.
- **Audit log** for every admin action touching member data or attendance overrides.
- **DPA template** for customers, since Face-Cam is the processor and each tenant is
  the controller.

Standard controls: bcrypt/argon2 password hashing, short-lived JWT access tokens with
rotating refresh tokens, rate limiting on auth and recognition endpoints, encrypted
CompreFace API keys at rest, HTTPS everywhere (required anyway by `getUserMedia`),
signed URLs for all image access.

---

## 13. v1 scope

**In scope**

Super admin console, tenant registration and subdomain portals, org admin auth,
member CRUD with dynamic fields, CSV member import, face enrollment, kiosk attendance
with device binding, PIN fallback, anti-spoof logging, attendance events and day
materialization, single shift plus holidays, attendance dashboard and CSV export,
suspension enforcement, email reminders, socket banners, branding from database,
one template shipped.

**Out of scope for v1**

Second UI template (data model supports it; the theme ships later), payment gateway
integration, member self-service login, parent and employee notifications
(WhatsApp/SMS), offline kiosk buffering, mobile apps, payroll integrations, leave
approval workflow, multi-shift scheduling, custom domains beyond subdomains,
enforced spoof rejection.

---

## 14. Assumptions pending confirmation

These were assumed to unblock this document. Correct them during review.

1. **Kiosk tablet model**, not per-person phones. Personal devices would need geofencing
   and would substantially weaken the anti-fraud story.
2. **Education template ships first**, corporate second.
3. **First customers are in India.** This keeps v1 compliance scope to DPDP-level
   consent and retention. EU or US customers would require more machinery before launch.
4. **Postgres and Adminer are already running**; the project only needs `DATABASE_URL`.
   The `pgvector` extension still has to be enabled on that instance.
5. Production domain is not chosen yet.

---

## 15. Environment variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5436/facecam_db

# App (NODE_ENV is set by the runtime, not here)
API_PORT=4000
WEB_PORT=3100
API_URL=http://localhost:4000
WEB_URL=http://localhost:3100
ROOT_DOMAIN=localhost:3100

# Auth
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
ENCRYPTION_KEY=              # for CompreFace API keys at rest

# File storage
FILE_UPLOAD=local            # local | aws
LOCAL_UPLOAD_DIR=./uploads
AWS_REGION=
AWS_S3_BUCKET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# CompreFace
COMPREFACE_URL=http://localhost:8000
COMPREFACE_ADMIN_API_KEY=

# Anti-spoof
ANTISPOOF_URL=http://localhost:8081
ANTISPOOF_ENABLED=true
ANTISPOOF_MODE=log           # log | enforce

# Redis
REDIS_URL=redis://localhost:6379

# Email
MAIL_PROVIDER=
MAIL_API_KEY=
MAIL_FROM=
```

---

## 16. Running the supporting services

CompreFace, its own Postgres, and the anti-spoof service run as one Docker
Compose project named `facecam`, defined in `docker/docker-compose.yml`.

The application's own Postgres is **not** in this file. It is an existing
instance the app reaches through `DATABASE_URL`, so it is not started or stopped
by these commands. Redis is likewise expected to already be running.

All commands are run from the repository root.

### Start and stop

```bash
pnpm docker:up      # start all Face-Cam services
pnpm docker:down    # stop and remove them
```

These wrap:

```bash
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml down
```

Other lifecycle commands:

```bash
# Stop without removing the containers (faster to bring back)
docker compose -f docker/docker-compose.yml stop
docker compose -f docker/docker-compose.yml start

# Restart everything, or a single service
docker compose -f docker/docker-compose.yml restart
docker compose -f docker/docker-compose.yml restart compreface-fe

# Rebuild after changing docker/antispoof/
docker compose -f docker/docker-compose.yml up -d --build antispoof

# Status
docker compose -f docker/docker-compose.yml ps
```

### Logs

```bash
# Everything, following live
docker compose -f docker/docker-compose.yml logs -f

# A single service
docker compose -f docker/docker-compose.yml logs -f compreface-api

# Last 50 lines, no follow
docker compose -f docker/docker-compose.yml logs --tail 50 compreface-fe

# With timestamps
docker compose -f docker/docker-compose.yml logs -f -t antispoof
```

`Ctrl+C` exits a `-f` follow.

### Service names and ports

| Service                  | Port     | Purpose                               |
| ------------------------ | -------- | ------------------------------------- |
| `compreface-fe`          | 8000     | CompreFace UI and API gateway (nginx) |
| `compreface-api`         | internal | Recognition REST API                  |
| `compreface-admin`       | internal | CompreFace admin backend              |
| `compreface-core`        | internal | ML inference (FaceNet / InsightFace)  |
| `compreface-postgres-db` | internal | CompreFace's own database             |
| `antispoof`              | 8081     | Presentation-attack scoring           |

Only `compreface-fe` and `antispoof` publish ports to the host. The API talks to
CompreFace through `COMPREFACE_URL` (port 8000) and to anti-spoofing through
`ANTISPOOF_URL` (port 8081).

### Shortcut from any directory

Once the containers exist, Docker can find them by project label, so the file
path can be dropped:

```bash
docker compose -p facecam ps
docker compose -p facecam logs -f compreface-api
docker compose -p facecam stop
```

`up` is the exception: it still needs the compose file, so use `pnpm docker:up`
from the repository root.

### Cautions

- **`down` is safe. `down -v` is not.** The plain form leaves the
  `facecam_compreface-postgres-data` volume intact, so CompreFace API keys and
  enrolled subjects survive a restart. Adding `-v` deletes that volume and
  forces every member to be re-enrolled. Never run it against anything but a
  throwaway local stack.
- **Other Docker projects on the machine are unaffected.** These commands are
  scoped to the `facecam` project only.
- **Verify with the health endpoint, not with `ps`.** A container reporting
  `running` is not the same as CompreFace being ready to answer. Use
  `curl http://localhost:4000/health`, which probes each dependency and reports
  them individually.
