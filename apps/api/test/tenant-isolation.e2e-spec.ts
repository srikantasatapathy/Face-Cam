import { INestApplication } from '@nestjs/common'
import { TenantStatus, TenantTemplate } from '@facecam/shared'
import request from 'supertest'
import { PrismaService } from '../src/prisma/prisma.service'
import { cookiesFrom, createTestApp, seedSuperAdmin, uniqueSlug } from './helpers'

/**
 * The highest-value tests in the project.
 *
 * One organization reading another's data would end the business, so these
 * assert the boundary from the outside, over HTTP, exactly as an attacker would
 * probe it. They deliberately do not reach into services or mock the database.
 */
describe('Tenant isolation', () => {
  let app: INestApplication
  let prisma: PrismaService

  const SUPER_PASSWORD = 'SuperSecret!2026'
  const ADMIN_PASSWORD = 'OrgAdminPass!2026'

  let superCookies: string
  let schoolId: string
  let schoolSlug: string
  let companyId: string
  let companySlug: string
  let schoolAdminEmail: string

  beforeAll(async () => {
    const ctx = await createTestApp()
    app = ctx.app
    prisma = ctx.prisma

    const superAdmin = await seedSuperAdmin(prisma, SUPER_PASSWORD)

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: superAdmin.email, password: SUPER_PASSWORD })
      .expect(200)

    superCookies = cookiesFrom(login.headers)

    schoolSlug = uniqueSlug('school')
    companySlug = uniqueSlug('company')
    schoolAdminEmail = `head@${schoolSlug}.test`

    const school = await request(app.getHttpServer())
      .post('/api/admin/tenants')
      .set('Cookie', superCookies)
      .send({
        name: 'Test School',
        slug: schoolSlug,
        template: TenantTemplate.EDUCATION,
        adminFullName: 'School Head',
        adminEmail: schoolAdminEmail,
        adminPassword: ADMIN_PASSWORD,
      })
      .expect(201)
    schoolId = school.body.id

    const company = await request(app.getHttpServer())
      .post('/api/admin/tenants')
      .set('Cookie', superCookies)
      .send({
        name: 'Test Company',
        slug: companySlug,
        template: TenantTemplate.CORPORATE,
        adminFullName: 'HR Lead',
        adminEmail: `hr@${companySlug}.test`,
        adminPassword: ADMIN_PASSWORD,
      })
      .expect(201)
    companyId = company.body.id
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [schoolId, companyId] } } })
    await app.close()
  })

  describe('authentication boundary', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/api/admin/tenants').expect(401)
    })

    it('confines credentials to the portal they belong to', async () => {
      // Correct portal.
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: schoolAdminEmail, password: ADMIN_PASSWORD, tenantSlug: schoolSlug })
        .expect(200)

      // Same credentials, a different organization's portal.
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: schoolAdminEmail, password: ADMIN_PASSWORD, tenantSlug: companySlug })
        .expect(401)

      // Same credentials against the platform console.
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: schoolAdminEmail, password: ADMIN_PASSWORD })
        .expect(401)
    })

    it('does not reveal whether an unknown portal exists', async () => {
      const unknownPortal = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: schoolAdminEmail, password: ADMIN_PASSWORD, tenantSlug: 'no-such-portal' })
        .expect(401)

      const wrongPassword = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: schoolAdminEmail, password: 'wrong', tenantSlug: schoolSlug })
        .expect(401)

      // Identical responses, so the endpoint cannot be used to enumerate
      // which organizations are registered on the platform.
      expect(unknownPortal.body.code).toBe(wrongPassword.body.code)
      expect(unknownPortal.body.message).toBe(wrongPassword.body.message)
    })
  })

  describe('cross-tenant access', () => {
    let schoolAdminCookies: string

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: schoolAdminEmail, password: ADMIN_PASSWORD, tenantSlug: schoolSlug })
        .expect(200)
      schoolAdminCookies = cookiesFrom(login.headers)
    })

    it('keeps an org admin out of the platform console', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/tenants')
        .set('Cookie', schoolAdminCookies)
        .expect(403)
    })

    it('keeps an org admin out of another organization', async () => {
      await request(app.getHttpServer())
        .get(`/api/admin/tenants/${companyId}`)
        .set('Cookie', schoolAdminCookies)
        .expect(403)
    })

    it('scopes a token to its own tenant, not the requested hostname', async () => {
      // Forging the host header must not change which tenant the caller acts
      // for: the tenant comes from the signed token, not from the request.
      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', schoolAdminCookies)
        .set('Host', `${companySlug}.localhost:3100`)
        .expect(200)

      expect(response.body.tenantSlug).toBe(schoolSlug)
      expect(response.body.tenantId).toBe(schoolId)
    })
  })

  describe('database-level scoping', () => {
    it('refuses to query a tenant-owned table with no tenant in context', async () => {
      // The Prisma extension fails closed. If this ever starts returning rows,
      // a missing tenant context has become a silent cross-tenant read.
      await expect(prisma.db.user.findMany({})).rejects.toThrow(/without a tenant context/i)
    })

    it('returns only the current tenant rows when a tenant is in context', async () => {
      const { RequestContext } = await import('../src/common/context/request-context')

      // The await must happen INSIDE run(). A PrismaPromise is lazy: it only
      // executes when awaited, so awaiting outside the scope would run the
      // query after the context is gone. Real requests are wrapped end to end
      // by the correlation-id middleware, so this only bites in tests.
      const schoolUsers = await RequestContext.run(
        { correlationId: 'test', tenantId: schoolId },
        async () => await prisma.db.user.findMany({}),
      )

      expect(schoolUsers.length).toBeGreaterThan(0)
      expect(schoolUsers.every((user) => user.tenantId === schoolId)).toBe(true)
    })

    it('hides super admins from tenant-scoped queries', async () => {
      const { RequestContext } = await import('../src/common/context/request-context')

      const users = await RequestContext.run(
        { correlationId: 'test', tenantId: schoolId },
        async () => await prisma.db.user.findMany({}),
      )

      // Super admins have a null tenant_id and belong to no organization.
      expect(users.some((user) => user.role === 'super_admin')).toBe(false)
    })

    it('stamps the tenant on writes automatically', async () => {
      const { RequestContext } = await import('../src/common/context/request-context')

      const log = await RequestContext.run(
        { correlationId: 'test', tenantId: schoolId },
        async () =>
          await prisma.db.auditLog.create({
            data: { action: 'test.write', entity: 'Test' },
          }),
      )

      expect(log.tenantId).toBe(schoolId)
      await prisma.auditLog.delete({ where: { id: log.id } })
    })
  })

  describe('suspension policy', () => {
    let schoolAdminCookies: string

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: schoolAdminEmail, password: ADMIN_PASSWORD, tenantSlug: schoolSlug })
        .expect(200)
      schoolAdminCookies = cookiesFrom(login.headers)

      await request(app.getHttpServer())
        .post(`/api/admin/tenants/${schoolId}/suspend`)
        .set('Cookie', superCookies)
        .send({ reason: 'Automated test suspension' })
        .expect(201)
    })

    afterAll(async () => {
      await request(app.getHttpServer())
        .post(`/api/admin/tenants/${schoolId}/reactivate`)
        .set('Cookie', superCookies)
        .expect(201)
    })

    it('blocks writes for a suspended tenant', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/logout-all')
        .set('Cookie', schoolAdminCookies)
        .expect(403)

      expect(response.body.code).toBe('TENANT_SUSPENDED')
    })

    it('keeps reads working, so records stay viewable and exportable', async () => {
      // Suspension pauses service; it must never lock an organization out of
      // its own attendance history. See PROJECT_DESCRIPTION.md section 10.
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', schoolAdminCookies)
        .expect(200)
    })

    it('keeps the portal resolving so the account can be settled', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/public/tenants/${schoolSlug}`)
        .expect(200)

      expect(response.body.status).toBe(TenantStatus.SUSPENDED)
    })

    it('still lets the super admin act on a suspended tenant', async () => {
      await request(app.getHttpServer())
        .patch(`/api/admin/tenants/${schoolId}`)
        .set('Cookie', superCookies)
        .send({ plan: 'standard' })
        .expect(200)
    })
  })
})
