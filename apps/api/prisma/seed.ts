/**
 * Seeds the accounts needed to use a fresh database.
 *
 * Creates the platform super admin, and (outside production) two demo
 * organizations so there is something to sign into immediately after a reset.
 *
 * Safe to re-run: every record is matched on a natural key and updated rather
 * than duplicated, and passwords are reset so a locked-out demo account can
 * always be recovered with one command.
 *
 *   pnpm db:seed
 *   SEED_DEMO=false pnpm db:seed     # super admin only
 */
import { PrismaClient, type Prisma } from '@prisma/client'
import * as argon2 from 'argon2'

const prisma = new PrismaClient()

const isProduction = process.env.NODE_ENV === 'production'
const seedDemo = process.env.SEED_DEMO !== 'false' && !isProduction

const superAdmin = {
  email: (process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@facecam.local').toLowerCase(),
  password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMeNow!2026',
  fullName: process.env.SEED_SUPER_ADMIN_NAME ?? 'Platform Administrator',
}

interface DemoOrg {
  name: string
  slug: string
  template: 'education' | 'corporate'
  status: 'trial' | 'active'
  timezone: string
  admin: { email: string; password: string; fullName: string }
}

/**
 * One organization per vertical, so both template paths can be exercised
 * without registering anything by hand.
 */
const DEMO_ORGS: DemoOrg[] = [
  {
    name: 'St Xavier High School',
    slug: 'st-xavier-high-school',
    template: 'education',
    status: 'active',
    timezone: 'Asia/Kolkata',
    admin: {
      email: 'anita@stxavier.edu',
      password: 'SchoolAdmin!2026',
      fullName: 'Anita Rao',
    },
  },
  {
    name: 'Acme Industries',
    slug: 'acme-industries',
    template: 'corporate',
    status: 'trial',
    timezone: 'Asia/Kolkata',
    admin: {
      email: 'ravi@acme.com',
      password: 'CorpAdmin!2026',
      fullName: 'Ravi Kumar',
    },
  },
]

function hash(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id })
}

/**
 * Super admins have a null tenantId, which cannot participate in the
 * (tenantId, email) compound unique that `upsert` would need, so the lookup is
 * done explicitly.
 */
async function seedSuperAdmin(): Promise<void> {
  if (superAdmin.password.length < 12) {
    throw new Error('SEED_SUPER_ADMIN_PASSWORD must be at least 12 characters')
  }

  const passwordHash = await hash(superAdmin.password)
  const existing = await prisma.user.findFirst({
    where: { email: superAdmin.email, tenantId: null },
  })

  const data: Prisma.UserUncheckedUpdateInput = {
    passwordHash,
    fullName: superAdmin.fullName,
    status: 'active',
    failedLoginCount: 0,
    lockedUntil: null,
  }

  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data })
    console.log(`  updated  super admin   ${superAdmin.email}`)
  } else {
    await prisma.user.create({
      data: {
        email: superAdmin.email,
        passwordHash,
        fullName: superAdmin.fullName,
        role: 'super_admin',
        tenantId: null,
      },
    })
    console.log(`  created  super admin   ${superAdmin.email}`)
  }
}

async function seedOrg(org: DemoOrg): Promise<void> {
  // Branding and settings are created only on insert. Re-running the seed must
  // not discard colours or thresholds someone changed while testing.
  const tenant = await prisma.tenant.upsert({
    where: { slug: org.slug },
    update: { name: org.name, timezone: org.timezone },
    create: {
      name: org.name,
      slug: org.slug,
      template: org.template,
      status: org.status,
      timezone: org.timezone,
      branding: { create: {} },
      settings: { create: {} },
    },
  })

  const passwordHash = await hash(org.admin.password)

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: org.admin.email } },
    update: {
      passwordHash,
      fullName: org.admin.fullName,
      status: 'active',
      failedLoginCount: 0,
      lockedUntil: null,
    },
    create: {
      tenantId: tenant.id,
      email: org.admin.email,
      passwordHash,
      fullName: org.admin.fullName,
      role: 'org_admin',
    },
  })

  console.log(`  ready    ${org.template.padEnd(10)} ${org.slug}  (${org.admin.email})`)
}

async function main(): Promise<void> {
  console.log('\nSeeding Face-Cam\n')

  await seedSuperAdmin()

  if (seedDemo) {
    for (const org of DEMO_ORGS) await seedOrg(org)
  } else {
    console.log('  skipped  demo organizations')
  }

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3100'

  console.log('\nSign in\n')
  console.log(`  Platform console   http://${rootDomain}/login`)
  console.log(`    ${superAdmin.email}  /  ${superAdmin.password}`)

  if (seedDemo) {
    for (const org of DEMO_ORGS) {
      console.log(`\n  ${org.name}   http://${org.slug}.${rootDomain}/login`)
      console.log(`    ${org.admin.email}  /  ${org.admin.password}`)
    }
    console.log(
      '\n  Portal credentials only work on their own portal. They are rejected at the\n' +
        '  apex domain and at any other organization, by design.',
    )
  }

  if (superAdmin.password === 'ChangeMeNow!2026') {
    console.warn('\n  WARNING: using the default super admin password. Change it before deploying.')
  }
  if (seedDemo) {
    console.warn(
      '  WARNING: demo organizations use published passwords. Never seed these in production.',
    )
  }
  console.log()
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
