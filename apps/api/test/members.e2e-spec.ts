import { INestApplication } from '@nestjs/common'
import { FieldType, TenantTemplate } from '@facecam/shared'
import request from 'supertest'
import { PrismaService } from '../src/prisma/prisma.service'
import { cookiesFrom, createTestApp, seedSuperAdmin, uniqueSlug } from './helpers'

/**
 * Members and the per-tenant field system.
 *
 * The theme running through these: an organization's field definitions change
 * over time, and none of those changes may damage member records that were
 * valid when they were written.
 */
describe('Members and field definitions', () => {
  let app: INestApplication
  let prisma: PrismaService

  const SUPER_PASSWORD = 'SuperSecret!2026'
  const ADMIN_PASSWORD = 'OrgAdminPass!2026'

  let superCookies: string
  let schoolCookies: string
  let companyCookies: string
  let schoolId: string
  let companyId: string

  async function createTenant(template: string, slug: string, email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/admin/tenants')
      .set('Cookie', superCookies)
      .send({
        name: `Test ${template}`,
        slug,
        template,
        adminFullName: 'Admin',
        adminEmail: email,
        adminPassword: ADMIN_PASSWORD,
      })
      .expect(201)

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: ADMIN_PASSWORD, tenantSlug: slug })
      .expect(200)

    return { id: response.body.id as string, cookies: cookiesFrom(login.headers) }
  }

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

    const schoolSlug = uniqueSlug('school')
    const companySlug = uniqueSlug('company')

    const school = await createTenant(
      TenantTemplate.EDUCATION,
      schoolSlug,
      `head@${schoolSlug}.test`,
    )
    schoolId = school.id
    schoolCookies = school.cookies

    const company = await createTenant(
      TenantTemplate.CORPORATE,
      companySlug,
      `hr@${companySlug}.test`,
    )
    companyId = company.id
    companyCookies = company.cookies
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [schoolId, companyId] } } })
    await app.close()
  })

  describe('template seeding', () => {
    it('gives each vertical its own field set', async () => {
      const school = await request(app.getHttpServer())
        .get('/api/member-fields')
        .set('Cookie', schoolCookies)
        .expect(200)

      const company = await request(app.getHttpServer())
        .get('/api/member-fields')
        .set('Cookie', companyCookies)
        .expect(200)

      const schoolKeys = school.body.map((f: { key: string }) => f.key)
      const companyKeys = company.body.map((f: { key: string }) => f.key)

      expect(schoolKeys).toContain('guardianPhone')
      expect(schoolKeys).not.toContain('designation')
      expect(companyKeys).toContain('designation')
      expect(companyKeys).not.toContain('guardianPhone')
    })

    it('returns fields in display order', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/member-fields')
        .set('Cookie', schoolCookies)
        .expect(200)

      const orders = response.body.map((f: { sortOrder: number }) => f.sortOrder)
      expect(orders).toEqual([...orders].sort((a, b) => a - b))
    })
  })

  describe('validation follows the tenant', () => {
    it('accepts a member matching this tenant field set', async () => {
      await request(app.getHttpServer())
        .post('/api/members')
        .set('Cookie', schoolCookies)
        .send({
          code: 'S-001',
          fullName: 'Valid Student',
          attributes: { class: '10', section: 'A', bloodGroup: 'O+' },
        })
        .expect(201)
    })

    it('rejects a value outside a select field options', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/members')
        .set('Cookie', schoolCookies)
        .send({ code: 'S-002', fullName: 'Bad Blood', attributes: { bloodGroup: 'Z+' } })
        .expect(422)

      expect(response.body.details).toHaveProperty(['attributes.bloodGroup'])
    })

    it('rejects a member code already used in this tenant', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/members')
        .set('Cookie', schoolCookies)
        .send({ code: 'S-001', fullName: 'Clash', attributes: {} })
        .expect(409)

      expect(response.body.code).toBe('MEMBER_CODE_TAKEN')
    })

    it('allows the same code in a different tenant', async () => {
      // Codes are unique per organization, not globally. Two schools both
      // numbering from 1 must not collide.
      await request(app.getHttpServer())
        .post('/api/members')
        .set('Cookie', companyCookies)
        .send({ code: 'S-001', fullName: 'Same Code Elsewhere', attributes: {} })
        .expect(201)
    })
  })

  describe('members are tenant scoped', () => {
    it('does not show one tenant members to another', async () => {
      const school = await request(app.getHttpServer())
        .get('/api/members')
        .set('Cookie', schoolCookies)
        .expect(200)

      const company = await request(app.getHttpServer())
        .get('/api/members')
        .set('Cookie', companyCookies)
        .expect(200)

      const schoolNames = school.body.items.map((m: { fullName: string }) => m.fullName)
      const companyNames = company.body.items.map((m: { fullName: string }) => m.fullName)

      expect(schoolNames).toContain('Valid Student')
      expect(companyNames).not.toContain('Valid Student')
    })

    it('returns 404 rather than 403 for another tenant member', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/members')
        .set('Cookie', companyCookies)
        .send({ code: 'C-999', fullName: 'Company Only', attributes: {} })
        .expect(201)

      // 403 would confirm the record exists. It must read as absent.
      await request(app.getHttpServer())
        .get(`/api/members/${created.body.id}`)
        .set('Cookie', schoolCookies)
        .expect(404)
    })
  })

  describe('changing field definitions does not damage existing members', () => {
    let memberId: string

    beforeAll(async () => {
      const created = await request(app.getHttpServer())
        .post('/api/members')
        .set('Cookie', schoolCookies)
        .send({
          code: 'S-100',
          fullName: 'Long Serving Student',
          attributes: { class: '9', section: 'C', bloodGroup: 'A+' },
        })
        .expect(201)
      memberId = created.body.id
    })

    it('keeps stored values when a field is archived', async () => {
      const fields = await request(app.getHttpServer())
        .get('/api/member-fields')
        .set('Cookie', schoolCookies)
        .expect(200)

      const section = fields.body.find((f: { key: string }) => f.key === 'section')

      await request(app.getHttpServer())
        .delete(`/api/member-fields/${section.id}`)
        .set('Cookie', schoolCookies)
        .expect(200)

      const member = await request(app.getHttpServer())
        .get(`/api/members/${memberId}`)
        .set('Cookie', schoolCookies)
        .expect(200)

      // Archiving removes the field from forms and validation. Destroying the
      // data an organization already entered would be unacceptable.
      expect(member.body.attributes.section).toBe('C')

      await request(app.getHttpServer())
        .post(`/api/member-fields/${section.id}/restore`)
        .set('Cookie', schoolCookies)
        .expect(201)
    })

    it('can still read a member after a new required field is added', async () => {
      await request(app.getHttpServer())
        .post('/api/member-fields')
        .set('Cookie', schoolCookies)
        .send({ key: 'houseName', label: 'House', type: FieldType.TEXT, required: true })
        .expect(201)

      // Existing members predate the field. Reading them must keep working, or
      // adding a required field would break every record already entered.
      const member = await request(app.getHttpServer())
        .get(`/api/members/${memberId}`)
        .set('Cookie', schoolCookies)
        .expect(200)

      expect(member.body.fullName).toBe('Long Serving Student')

      const list = await request(app.getHttpServer())
        .get('/api/members')
        .set('Cookie', schoolCookies)
        .expect(200)

      expect(list.body.total).toBeGreaterThan(0)
    })

    it('enforces the new required field on the next write', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/members')
        .set('Cookie', schoolCookies)
        .send({ code: 'S-101', fullName: 'New Student', attributes: { class: '9' } })
        .expect(422)

      expect(response.body.details).toHaveProperty(['attributes.houseName'])
    })

    it('rejects a select field defined with no options', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/member-fields')
        .set('Cookie', schoolCookies)
        .send({ key: 'emptyChoice', label: 'Empty', type: FieldType.SELECT, options: [] })
        .expect(422)

      expect(response.body.details).toHaveProperty('options')
    })

    it('archives the required field so later tests start clean', async () => {
      const fields = await request(app.getHttpServer())
        .get('/api/member-fields')
        .set('Cookie', schoolCookies)
        .expect(200)

      const house = fields.body.find((f: { key: string }) => f.key === 'houseName')
      await request(app.getHttpServer())
        .delete(`/api/member-fields/${house.id}`)
        .set('Cookie', schoolCookies)
        .expect(200)
    })

    it('refuses to reuse the key of an archived field', async () => {
      const fields = await request(app.getHttpServer())
        .get('/api/member-fields?includeArchived=true')
        .set('Cookie', schoolCookies)
        .expect(200)

      const address = fields.body.find((f: { key: string }) => f.key === 'address')
      await request(app.getHttpServer())
        .delete(`/api/member-fields/${address.id}`)
        .set('Cookie', schoolCookies)
        .expect(200)

      // Recreating the key would make the archived data reappear under a field
      // that may now mean something different.
      const response = await request(app.getHttpServer())
        .post('/api/member-fields')
        .set('Cookie', schoolCookies)
        .send({ key: 'address', label: 'Address', type: FieldType.TEXT })
        .expect(409)

      expect(response.body.code).toBe('FIELD_KEY_TAKEN')
    })
  })

  describe('CSV import', () => {
    const mapping = { code: 'Roll', fullName: 'Name', class: 'Class' }

    it('reports errors without writing anything on a dry run', async () => {
      const before = await prisma.member.count({ where: { tenantId: schoolId } })

      const response = await request(app.getHttpServer())
        .post('/api/members/import')
        .set('Cookie', schoolCookies)
        .send({
          dryRun: true,
          mapping,
          rows: [
            { Roll: 'I-001', Name: 'Fine Student', Class: '8' },
            { Roll: 'I-002', Name: '', Class: '8' },
            { Roll: 'I-001', Name: 'Duplicate Roll', Class: '8' },
          ],
        })
        .expect(200)

      expect(response.body.dryRun).toBe(true)
      expect(response.body.errors.length).toBeGreaterThan(0)
      // Row numbers count the header as row 1, matching what a spreadsheet shows.
      expect(response.body.errors.some((e: { row: number }) => e.row === 3)).toBe(true)

      const after = await prisma.member.count({ where: { tenantId: schoolId } })
      expect(after).toBe(before)
    })

    it('writes nothing when a real run contains any invalid row', async () => {
      const before = await prisma.member.count({ where: { tenantId: schoolId } })

      const response = await request(app.getHttpServer())
        .post('/api/members/import')
        .set('Cookie', schoolCookies)
        .send({
          dryRun: false,
          mapping,
          rows: [
            { Roll: 'I-010', Name: 'Good One', Class: '8' },
            { Roll: 'I-011', Name: '', Class: '8' },
          ],
        })
        .expect(200)

      expect(response.body.created).toBe(0)

      // All-or-nothing: a partial import leaves an admin unable to tell which
      // rows landed, and re-uploading then trips duplicate errors.
      const after = await prisma.member.count({ where: { tenantId: schoolId } })
      expect(after).toBe(before)
    })

    it('imports a clean file', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/members/import')
        .set('Cookie', schoolCookies)
        .send({
          dryRun: false,
          mapping,
          rows: [
            { Roll: 'I-020', Name: 'Imported One', Class: '8' },
            { Roll: 'I-021', Name: 'Imported Two', Class: '8' },
          ],
        })
        .expect(200)

      expect(response.body.created).toBe(2)
      expect(response.body.errors).toEqual([])
    })

    it('does not grant biometric consent through an import', async () => {
      const member = await prisma.member.findFirst({
        where: { tenantId: schoolId, code: 'I-020' },
      })

      // A spreadsheet cannot record that a person agreed to biometric
      // processing. Imported members exist but cannot be face-enrolled until
      // consent is captured for them individually.
      expect(member?.consentAt).toBeNull()
    })
  })

  describe('archiving a member', () => {
    it('hides them from the roll but keeps the record', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/members')
        .set('Cookie', schoolCookies)
        .send({ code: 'S-900', fullName: 'Leaving Student', attributes: { houseName: 'Blue' } })
        .expect(201)

      await request(app.getHttpServer())
        .delete(`/api/members/${created.body.id}`)
        .set('Cookie', schoolCookies)
        .expect(200)

      const list = await request(app.getHttpServer())
        .get('/api/members')
        .set('Cookie', schoolCookies)
        .expect(200)

      expect(list.body.items.map((m: { code: string }) => m.code)).not.toContain('S-900')

      // The row survives, because attendance history for earlier months must
      // still resolve the members it refers to.
      const stillThere = await prisma.member.findUnique({ where: { id: created.body.id } })
      expect(stillThere).not.toBeNull()
      expect(stillThere?.archivedAt).not.toBeNull()
    })
  })
})
