'use client'

import { Alert, Button, Field, Input } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { TenantStatus } from '@facecam/shared'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Suspend and reactivate.
 *
 * Suspension asks for a reason and a typed confirmation, because it stops a
 * customer's service and is recorded permanently in the audit log. Reactivation
 * is a single click: restoring service should never be the harder path.
 */
export function TenantStatusActions({
  tenantId,
  status,
  name,
}: {
  tenantId: string
  status: string
  name: string
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [typedName, setTypedName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const suspended = status === TenantStatus.SUSPENDED

  async function run(action: 'suspend' | 'reactivate') {
    setPending(true)
    setError(null)
    try {
      await api.post(
        `/admin/tenants/${tenantId}/${action}`,
        action === 'suspend' ? { reason } : undefined,
      )
      setConfirming(false)
      setReason('')
      setTypedName('')
      router.refresh()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong. Try again.')
    } finally {
      setPending(false)
    }
  }

  if (suspended) {
    return (
      <div className="flex flex-col gap-3">
        {error && <Alert>{error}</Alert>}
        <div>
          <Button onClick={() => run('reactivate')} disabled={pending}>
            {pending ? 'Restoring…' : 'Restore service'}
          </Button>
        </div>
      </div>
    )
  }

  if (!confirming) {
    return (
      <div className="flex flex-col gap-3">
        {error && <Alert>{error}</Alert>}
        <div>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Suspend service
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-control border border-danger/30 bg-danger/5 p-4">
      {error && <Alert>{error}</Alert>}

      <p className="text-sm text-content">
        This stops attendance capture for <strong>{name}</strong>. Staff can still sign in to view
        and export their records.
      </p>

      <Field label="Reason" hint="Recorded in the audit log and visible to other administrators.">
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Invoice INV-2026-041 unpaid for 21 days"
          disabled={pending}
        />
      </Field>

      <Field label={`Type "${name}" to confirm`}>
        <Input
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          disabled={pending}
        />
      </Field>

      <div className="flex gap-2">
        <Button
          variant="danger"
          onClick={() => run('suspend')}
          disabled={pending || typedName !== name || reason.trim().length < 3}
        >
          {pending ? 'Suspending…' : 'Suspend service'}
        </Button>
        <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
