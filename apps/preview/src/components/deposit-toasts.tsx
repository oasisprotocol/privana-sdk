'use client'

import { useDeposit } from '@oasisprotocol/privana-sdk'
import { toast } from 'sonner'

// Mounted once for the whole app: a deposit keeps crediting after its modal
// closes, so a modal's onDepositSuccess would miss those credits.
export function DepositToasts() {
  useDeposit({
    // With an allowance, the deposit is done once the lock is accepted.
    onCredited: (_txHash, _response, lockPending) => {
      if (!lockPending) toast.success('Deposit credited')
    },
    onLockSubmitted: () => toast.success('Deposit credited'),
  })
  return null
}
