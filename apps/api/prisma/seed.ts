/**
 * Creates the first super admin.
 *
 * Without this there is no way into the platform console, and no way to
 * register the first organization. Safe to re-run: it updates the existing
 * account rather than failing or creating a duplicate.
 *
 *   pnpm --filter @facecam/api db:seed
 */
import { PrismaClient } from '@prisma/client'
import * as argon2 from 'argon2'

const prisma = new PrismaClient()

const email = (process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@facecam.local').toLowerCase()
const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMeNow!2026'
const fullName = process.env.SEED_SUPER_ADMIN_NAME ?? 'Platform Administrator'

async function main(): Promise<void> {
  if (password.length < 12) {
    throw new Error('SEED_SUPER_ADMIN_PASSWORD must be at least 12 characters')
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id })

  // tenantId is null for super admins, and `upsert` needs the full compound
  // unique, so the lookup is done explicitly.
  const existing = await prisma.user.findFirst({ where: { email, tenantId: null } })

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, fullName, status: 'active', failedLoginCount: 0, lockedUntil: null },
    })
    console.log(`Updated existing super admin: ${email}`)
  } else {
    await prisma.user.create({
      data: { email, passwordHash, fullName, role: 'super_admin', tenantId: null },
    })
    console.log(`Created super admin: ${email}`)
  }

  if (password === 'ChangeMeNow!2026') {
    console.warn('\n  WARNING: using the default seed password. Change it before deploying.\n')
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
