'use client'

import { Button } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Archives or restores a member.
 *
 * Deliberately not a delete. Attendance history refers to members, so removing
 * the row would leave last month's report unable to name who was present.
 */
export function ArchiveMemberButton({
  memberId,
  archived,
}: {
  memberId: string
  archived: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function run() {
    setPending(true)
    try {
      if (archived) await api.post(`/members/${memberId}/restore`)
      else await api.delete(`/members/${memberId}`)
      setConfirming(false)
      router.refresh()
    } catch (error) {
      alert(error instanceof ApiError ? error.message : 'Something went wrong.')
    } finally {
      setPending(false)
    }
  }

  if (archived) {
    return (
      <Button variant="secondary" onClick={run} disabled={pending}>
        {pending ? 'Restoring…' : 'Restore'}
      </Button>
    )
  }

  if (!confirming) {
    return (
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        Archive
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-content-muted">Archive this member?</span>
      <Button variant="danger" onClick={run} disabled={pending}>
        {pending ? 'Archiving…' : 'Yes'}
      </Button>
      <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
        No
      </Button>
    </div>
  )
}
