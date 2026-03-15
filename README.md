# Face-Cam

Multi-tenant face recognition attendance platform for schools, colleges and companies.

- **Specification (what we're building):** [PROJECT_DESCRIPTION.md](./PROJECT_DESCRIPTION.md)
- **Task breakdown (what's left):** [CHECKLIST.md](./CHECKLIST.md)
- **Documentation (what exists today):** [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md)

## Stack

| Layer         | Choice                                           |
| ------------- | ------------------------------------------------ |
| Frontend      | Next.js 15 (App Router), Tailwind, port **3100** |
| Backend       | NestJS 10, port **4000**                         |
| Database      | PostgreSQL 17 + pgvector, port **5436**          |
| Cache / queue | Redis, port 6379                                 |
| Face engine   | CompreFace 1.2.0, port **8000**                  |
| Anti-spoof    | FastAPI service, port **8081**                   |

Managed as a pnpm workspace.

## Prerequisites

- Node 20+ and pnpm 9 (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- Docker with Compose
- A PostgreSQL instance with the `vector` and `pgcrypto` extensions available

## First-time setup

```bash
# 1. Install dependencies
pnpm install

# 2. Configure
cp .env.example .env
# Generate the secrets:
#   openssl rand -base64 48   -> JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
#   openssl rand -base64 32   -> ENCRYPTION_KEY
# Set DATABASE_URL to your Postgres instance.

# 3. Start CompreFace, its database, and the anti-spoof service
pnpm docker:up

# 4. Apply migrations
pnpm db:migrate

# 5. Create the first super admin
pnpm db:seed
```

### Seeded accounts

`pnpm db:seed` is safe to re-run: it updates existing records rather than duplicating
them, and resets passwords, so a locked-out demo account is always one command away
from working again.

| Account               | Password           | Sign in at                                        |
| --------------------- | ------------------ | ------------------------------------------------- |
| `admin@facecam.local` | `ChangeMeNow!2026` | http://localhost:3100/login                       |
| `anita@stxavier.edu`  | `SchoolAdmin!2026` | http://st-xavier-high-school.localhost:3100/login |
| `ravi@acme.com`       | `CorpAdmin!2026`   | http://acme-industries.localhost:3100/login       |

The two organizations are demo data covering both templates: St Xavier is an
`education` tenant in `active` status with 4 students, Acme is a `corporate` tenant
still in `trial` with 3 employees. Each gets the field set for its vertical, so the
same member list renders Roll Number / Class / Section for the school and Employee
Code / Department / Designation for the company.

**Portal credentials only work on their own portal.** They are rejected at the apex
domain and at any other organization, by design. See PROJECT_DOCUMENTATION.md, Phase 1.

Demo organizations are skipped when `NODE_ENV=production`, and can be skipped anywhere
with `SEED_DEMO=false`. Override the super admin with `SEED_SUPER_ADMIN_EMAIL` and
`SEED_SUPER_ADMIN_PASSWORD`, and change it before any deployment.

## Running day to day

```bash
pnpm docker:up    # once per boot; skip if the containers are already running
pnpm dev          # builds the shared package, then runs api + web together
```

`pnpm dev` starts three processes in parallel: `@facecam/shared` in watch mode, the
NestJS API, and the Next.js app. The shared package is built **first** because the
other two import its compiled output; without that, an edit to a shared schema would
silently not reach them.

`Ctrl+C` stops all three. Docker keeps running until `pnpm docker:down`.

To run just one side:

```bash
pnpm dev:api
pnpm dev:web
```

Both still need `@facecam/shared` built at least once (`pnpm build:shared`).

| URL                                 | What                            |
| ----------------------------------- | ------------------------------- |
| http://localhost:3100               | Apex: marketing, platform login |
| http://localhost:3100/admin         | Super admin console             |
| http://&lt;slug&gt;.localhost:3100  | An organization's portal        |
| **http://localhost:4000/api/docs**  | **Swagger UI**                  |
| http://localhost:4000/api/docs-json | OpenAPI spec as JSON            |
| http://localhost:4000/health        | Dependency health report        |
| http://localhost:8000               | CompreFace admin UI             |

## API documentation

Swagger UI is at **http://localhost:4000/api/docs**, enabled in every environment
except production. The spec itself is a complete map of the API, and this service
handles biometric data, so it is never served in production.

Request schemas are generated from the same Zod schemas that perform validation
(`src/common/swagger/zod-openapi.ts`), so the documentation cannot drift from the
rules actually enforced. Field types, formats, enums, length limits and which fields
are required all come straight from the validator.

### Trying authenticated endpoints

Auth uses httpOnly cookies, so there is no token to copy and paste:

1. Open `POST /api/auth/login`, click **Try it out**.
2. Send `{"email": "admin@facecam.local", "password": "ChangeMeNow!2026"}`.
   Omit `tenantSlug` for the platform console; include it to sign in to a portal.
3. Every subsequent request from the UI carries the cookie automatically.

To sign out, call `POST /api/auth/logout` or clear cookies for `localhost:4000`.

## Scripts

| Command                          | What it does                                                |
| -------------------------------- | ----------------------------------------------------------- |
| `pnpm dev`                       | Build shared, then run api and web together                 |
| `pnpm dev:api` / `dev:web`       | Run one side only                                           |
| `pnpm build`                     | Build shared, then both apps                                |
| `pnpm build:shared`              | Build the shared package on its own                         |
| `pnpm typecheck`                 | Typecheck every package                                     |
| `pnpm lint`                      | Lint every package                                          |
| `pnpm format`                    | Prettier over the repo                                      |
| `pnpm test:e2e`                  | Isolation and suspension tests (prepares the test DB first) |
| `pnpm test:db:setup`             | Create and migrate `facecam_test_db` on its own             |
| `pnpm db:migrate`                | Create and apply a Prisma migration                         |
| `pnpm db:deploy`                 | Apply pending migrations without generating one             |
| `pnpm db:seed`                   | Create or reset the super admin and demo organizations      |
| `pnpm db:studio`                 | Prisma Studio                                               |
| `pnpm db:generate`               | Regenerate the Prisma client                                |
| `pnpm docker:up` / `docker:down` | Start / stop supporting services                            |
| `pnpm docker:logs` / `docker:ps` | Follow logs / show service status                           |

## How multi-tenancy works

Tenants are identified **by hostname**, never by a path segment. `acme.localhost:3100`
is rewritten by `apps/web/src/middleware.ts` to the internal `/t/acme` route tree, and
requesting `/t/acme` directly returns 404 so the hostname check cannot be bypassed.

On the API side, the tenant is resolved once per request into `AsyncLocalStorage`
(`apps/api/src/common/context/request-context.ts`) and applied automatically to
queries. Postgres Row Level Security is the backstop. Both layers must be present.

## Storage

The storage backend is chosen by one variable:

```env
FILE_UPLOAD=local   # writes to LOCAL_UPLOAD_DIR
FILE_UPLOAD=aws     # writes to AWS_S3_BUCKET
```

Both sit behind a single `StorageService` interface, so switching is a config change.
The API refuses to boot with `FILE_UPLOAD=aws` and missing AWS credentials.

Face images are **never** served from a public path. `uploads/` is gitignored. When
running with the local driver, mount `uploads/` as a Docker volume or redeploys will
erase it, and back it up alongside the Postgres dump.

## Notes and known gaps

- **Anti-spoofing is not implemented yet.** The service runs and answers the health
  check but ships without model weights, so it reports `ready: false` and returns a
  null score rather than a fabricated one. See [docker/antispoof/README.md](./docker/antispoof/README.md).
- **Apple Silicon:** CompreFace publishes amd64-only images and runs under emulation.
  Expect much slower recognition than production x86 hardware. Do not benchmark
  throughput on a Mac.
- **Face templates are biometric data.** Consent capture, retention limits and audit
  logging are requirements, not nice-to-haves. See PROJECT_DESCRIPTION.md section 12.
