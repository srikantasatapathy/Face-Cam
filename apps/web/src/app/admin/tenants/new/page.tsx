import { CreateTenantForm } from './create-tenant-form'
import Link from 'next/link'

export default function NewTenantPage() {
  return (
    <div className="max-w-2xl">
      <Link href="/admin/tenants" className="text-sm text-content-muted underline">
        Back to organizations
      </Link>

      <h1 className="mt-3 text-2xl font-semibold text-content">Register an organization</h1>
      <p className="mt-1 text-content-muted">
        This creates the portal and its first administrator together. An organization with no
        administrator cannot be signed into.
      </p>

      <div className="mt-6 rounded-card border border-line bg-surface p-6">
        <CreateTenantForm />
      </div>
    </div>
  )
}
