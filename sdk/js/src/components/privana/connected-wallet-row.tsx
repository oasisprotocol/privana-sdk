import { shortenAddress } from '@/lib/utils'

export function ConnectedWalletRow({ label, address }: { label: 'From' | 'To'; address: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-foreground text-sm font-medium">
        Connected wallet · {shortenAddress(address)}
      </span>
    </div>
  )
}
