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
import { fieldsForTemplate } from '@facecam/shared'
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
  /** A handful of members so both portals have something to show. */
  members: Array<{
    code: string
    fullName: string
    email?: string
    attributes: Record<string, string>
  }>
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
    members: [
      {
        code: 'S-1001',
        fullName: 'Meera Krishnan',
        email: 'meera@stxavier.edu',
        attributes: { class: '10', section: 'B', bloodGroup: 'O+', gender: 'Female' },
      },
      {
        code: 'S-1002',
        fullName: 'Arjun Nair',
        attributes: { class: '10', section: 'A', bloodGroup: 'B+', gender: 'Male' },
      },
      {
        code: 'S-1003',
        fullName: 'Priya Menon',
        attributes: { class: '9', section: 'A', bloodGroup: 'A-', gender: 'Female' },
      },
      {
        code: 'S-1004',
        fullName: 'Rohan Das',
        attributes: { class: '9', section: 'C', bloodGroup: 'AB+', gender: 'Male' },
      },
    ],
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
    members: [
      {
        code: 'EMP-2001',
        fullName: 'Sunita Iyer',
        email: 'sunita@acme.com',
        attributes: {
          department: 'Engineering',
          designation: 'Senior Engineer',
          employmentType: 'Full-time',
          gender: 'Female',
        },
      },
      {
        code: 'EMP-2002',
        fullName: 'Vikram Shah',
        email: 'vikram@acme.com',
        attributes: {
          department: 'Engineering',
          designation: 'Team Lead',
          employmentType: 'Full-time',
          gender: 'Male',
        },
      },
      {
        code: 'EMP-2003',
        fullName: 'Fatima Sheikh',
        attributes: {
          department: 'Operations',
          designation: 'Shift Supervisor',
          employmentType: 'Full-time',
          gender: 'Female',
        },
      },
    ],
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

  await seedFieldDefinitions(tenant.id, org.template)

  // Members are created only when missing, and never overwritten: a demo
  // record someone edited while testing stays as they left it.
  for (const member of org.members) {
    const exists = await prisma.member.findFirst({
      where: { tenantId: tenant.id, code: member.code },
      select: { id: true },
    })
    if (exists) continue

    await prisma.member.create({
      data: {
        tenantId: tenant.id,
        code: member.code,
        fullName: member.fullName,
        email: member.email ?? null,
        attributes: member.attributes,
      },
    })
  }

  console.log(
    `  ready    ${org.template.padEnd(10)} ${org.slug}  ` +
      `(${org.admin.email}, ${org.members.length} members)`,
  )
}

/**
 * Gives a tenant the field set for its template, skipping keys it already has.
 *
 * Also repairs tenants created before field seeding existed. Existing rows are
 * never overwritten: an organization that renamed a label or changed a required
 * flag keeps its choices.
 */
async function seedFieldDefinitions(tenantId: string, template: string): Promise<number> {
  const existing = await prisma.memberFieldDefinition.findMany({
    where: { tenantId },
    select: { key: true },
  })
  const have = new Set(existing.map((row) => row.key))

  const missing = fieldsForTemplate(template)
    .filter((field) => !have.has(field.key))
    .map((field) => ({
      tenantId,
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      options: field.options ?? [],
      group: field.group ?? null,
      sortOrder: field.sortOrder,
      helpText: field.helpText ?? null,
      maxLength: field.maxLength ?? null,
      min: field.min ?? null,
      max: field.max ?? null,
    })) as Prisma.MemberFieldDefinitionCreateManyInput[]

  if (missing.length > 0) {
    await prisma.memberFieldDefinition.createMany({ data: missing })
  }
  return missing.length
}

/** Repairs any tenant that has no field definitions, including non-demo ones. */
async function backfillFieldDefinitions(): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true, template: true } })

  for (const tenant of tenants) {
    const added = await seedFieldDefinitions(tenant.id, tenant.template)
    if (added > 0) console.log(`  backfill ${tenant.slug}: added ${added} field definitions`)
  }
}

async function main(): Promise<void> {
  console.log('\nSeeding Face-Cam\n')

  await seedSuperAdmin()

  if (seedDemo) {
    for (const org of DEMO_ORGS) await seedOrg(org)
  } else {
    console.log('  skipped  demo organizations')
  }

  await backfillFieldDefinitions()

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
