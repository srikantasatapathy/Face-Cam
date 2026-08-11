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

## Setup

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

# 4. Build the shared package (api and web both import it)
pnpm --filter @facecam/shared build

# 5. Apply migrations
pnpm db:migrate

# 6. Create the first super admin
pnpm db:seed

# 7. Run both apps
pnpm dev
```

Default seed credentials are `admin@facecam.local` / `ChangeMeNow!2026`.
Override with `SEED_SUPER_ADMIN_EMAIL` and `SEED_SUPER_ADMIN_PASSWORD`, and
change them before any deployment.

| URL                            | What                                        |
| ------------------------------ | ------------------------------------------- |
| http://localhost:3100          | Web app (apex)                              |
| http://acme.localhost:3100     | Tenant portal (resolves once tenants exist) |
| http://localhost:4000/health   | API health report                           |
| http://localhost:4000/api/docs | Swagger UI                                  |
| http://localhost:8000          | CompreFace admin UI                         |

## Scripts

| Command                          | What it does                        |
| -------------------------------- | ----------------------------------- |
| `pnpm dev`                       | Run api and web together            |
| `pnpm build`                     | Build shared, then both apps        |
| `pnpm typecheck`                 | Typecheck every package             |
| `pnpm lint`                      | Lint every package                  |
| `pnpm format`                    | Prettier over the repo              |
| `pnpm db:migrate`                | Create and apply a Prisma migration |
| `pnpm db:studio`                 | Prisma Studio                       |
| `pnpm docker:up` / `docker:down` | Start / stop supporting services    |

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
