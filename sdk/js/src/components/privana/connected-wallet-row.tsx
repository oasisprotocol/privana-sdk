export function ConnectedWalletRow({ label, address }: { label: 'From' | 'To'; address: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground shrink-0 text-sm">{label}</span>
      <span title={address} className="text-foreground flex min-w-0 text-sm font-medium">
        <span className="truncate">{address.slice(0, -6)}</span>
        <span className="shrink-0">{address.slice(-6)}</span>
      </span>
    </div>
  )
}
