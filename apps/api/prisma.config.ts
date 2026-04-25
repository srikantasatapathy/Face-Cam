import path from 'node:path'
import { defineConfig } from 'prisma/config'

/**
 * Replaces the deprecated `package.json#prisma` block, which Prisma 7 removes.
 *
 * Note: once this file exists, Prisma stops auto-loading `.env`. That is fine
 * here because every `db:*` script already runs through `dotenv-cli` pointed at
 * the single root `.env`, which is the only place configuration lives.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
})
