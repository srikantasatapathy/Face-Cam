import { Prisma } from '@prisma/client'
import { TENANT_SCOPED_MODELS } from '../src/prisma/tenant-scope'

/**
 * Guards the registry in tenant-scope.ts.
 *
 * The extension protects only models listed there. A new model with a
 * `tenantId` column that nobody remembers to register would be queried
 * completely unscoped, which is the exact failure this project cannot have.
 * This test reads the generated Prisma metadata, so adding such a model breaks
 * the build rather than silently shipping.
 */
describe('tenant scoping registry', () => {
  it('covers every model that has a tenantId field', () => {
    const withTenantId = Prisma.dmmf.datamodel.models
      .filter((model) => model.fields.some((field) => field.name === 'tenantId'))
      .map((model) => model.name)

    const unregistered = withTenantId.filter((name) => !(name in TENANT_SCOPED_MODELS))

    expect(unregistered).toEqual([])
  })

  it('does not scope the Tenant model itself', () => {
    // Tenant is the root of the hierarchy. Scoping it would break the super
    // admin console, which must list every organization.
    expect(TENANT_SCOPED_MODELS).not.toHaveProperty('Tenant')
  })
})
