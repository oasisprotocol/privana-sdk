'use client'

interface IconProps {
  className?: string
  size?: number
}

export function USDCIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path
        d="M20.5 18.5C20.5 20.7 18.7 22 16 22C13.3 22 11.5 20.7 11.5 18.5H13.5C13.5 19.6 14.5 20.5 16 20.5C17.5 20.5 18.5 19.6 18.5 18.5C18.5 17.4 17.5 16.8 16 16.5C13.3 15.9 11.5 14.9 11.5 12.5C11.5 10.3 13.3 9 16 9C18.7 9 20.5 10.3 20.5 12.5H18.5C18.5 11.4 17.5 10.5 16 10.5C14.5 10.5 13.5 11.4 13.5 12.5C13.5 13.6 14.5 14.2 16 14.5C18.7 15.1 20.5 16.1 20.5 18.5Z"
        fill="white"
      />
      <path d="M16 7V9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 22V24" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function USDTIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="16" cy="16" r="16" fill="#26A17B" />
      <path d="M17.5 17.5V22.5H14.5V17.5H9V14.5H23V17.5H17.5Z" fill="white" />
      <path d="M9 11.5H23V14.5H9V11.5Z" fill="white" />
    </svg>
  )
}

export function WETHIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="16" cy="16" r="16" fill="#627EEA" />
      <path d="M16 4V12.87L23 16.22L16 4Z" fill="white" fillOpacity="0.6" />
      <path d="M16 4L9 16.22L16 12.87V4Z" fill="white" />
      <path d="M16 21.97V28L23 17.62L16 21.97Z" fill="white" fillOpacity="0.6" />
      <path d="M16 28V21.97L9 17.62L16 28Z" fill="white" />
      <path d="M16 20.57L23 16.22L16 12.87V20.57Z" fill="white" fillOpacity="0.2" />
      <path d="M9 16.22L16 20.57V12.87L9 16.22Z" fill="white" fillOpacity="0.6" />
    </svg>
  )
}

export function BaseIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="16" cy="16" r="16" fill="#0052FF" />
      <path
        d="M16 26C21.5228 26 26 21.5228 26 16C26 10.4772 21.5228 6 16 6C10.4772 6 6 10.4772 6 16C6 21.5228 10.4772 26 16 26Z"
        fill="#0052FF"
      />
      <path
        d="M15.9 22.8C19.7 22.8 22.8 19.7 22.8 15.9C22.8 12.1 19.7 9 15.9 9C12.3 9 9.3 11.8 9 15.3H18V16.5H9C9.3 20 12.3 22.8 15.9 22.8Z"
        fill="white"
      />
    </svg>
  )
}

export function getTokenIcon(symbol: string, size?: number) {
  const iconSize = size ?? 24
  switch (symbol.toUpperCase()) {
    case 'USDC':
      return <USDCIcon size={iconSize} />
    case 'USDT':
      return <USDTIcon size={iconSize} />
    case 'WETH':
      return <WETHIcon size={iconSize} />
    default:
      return (
        <div
          className="bg-muted flex items-center justify-center rounded-full text-xs font-bold"
          style={{ width: iconSize, height: iconSize }}
        >
          {symbol.slice(0, 2)}
        </div>
      )
  }
}

export function getChainIcon(chainId: number, size?: number) {
  const iconSize = size ?? 24
  switch (chainId) {
    case 84532:
      return <BaseIcon size={iconSize} />
    default:
      return (
        <div
          className="bg-muted flex items-center justify-center rounded-full text-xs font-bold"
          style={{ width: iconSize, height: iconSize }}
        >
          ?
        </div>
      )
  }
}
