'use client'

interface IconProps {
  className?: string
  size?: number
}

export function ChevronRightIcon() {
  return (
    <svg width="10" height="5" viewBox="0 0 12 6" className="-rotate-90">
      <path
        d="M0 0l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export function USDCIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 2000 2000"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M1000 2000c554.17 0 1000-445.83 1000-1000S1554.17 0 1000 0 0 445.83 0 1000s445.83 1000 1000 1000z"
        fill="#2775ca"
      />
      <path
        d="M1275 1158.33c0-145.83-87.5-195.83-262.5-216.66-125-16.67-150-50-150-108.34s41.67-95.83 125-95.83c75 0 116.67 25 137.5 87.5 4.17 12.5 16.67 20.83 29.17 20.83h66.66c16.67 0 29.17-12.5 29.17-29.16v-4.17c-16.67-91.67-91.67-162.5-187.5-170.83v-100c0-16.67-12.5-29.17-33.33-33.34h-62.5c-16.67 0-29.17 12.5-33.34 33.34v95.83c-125 16.67-204.16 100-204.16 204.17 0 137.5 83.33 191.66 258.33 212.5 116.67 20.83 154.17 45.83 154.17 112.5s-58.34 112.5-137.5 112.5c-108.34 0-145.84-45.84-158.34-108.34-4.16-16.66-16.66-25-29.16-25h-70.84c-16.66 0-29.16 12.5-29.16 29.17v4.17c16.66 104.16 83.33 179.16 220.83 200v100c0 16.66 12.5 29.16 33.33 33.33h62.5c16.67 0 29.17-12.5 33.34-33.33v-100c125-20.84 208.33-108.34 208.33-220.84z"
        fill="#fff"
      />
      <path
        d="M787.5 1595.83c-325-116.66-491.67-479.16-370.83-800 62.5-175 200-308.33 370.83-370.83 16.67-8.33 25-20.83 25-41.67V325c0-16.67-8.33-29.17-25-33.33-4.17 0-12.5 0-16.67 4.16-395.83 125-612.5 545.84-487.5 941.67 75 233.33 254.17 412.5 487.5 487.5 16.67 8.33 33.34 0 37.5-16.67 4.17-4.16 4.17-8.33 4.17-16.66v-58.34c0-12.5-12.5-29.16-25-37.5zM1229.17 295.83c-16.67-8.33-33.34 0-37.5 16.67-4.17 4.17-4.17 8.33-4.17 16.67v58.33c0 16.67 12.5 33.33 25 41.67 325 116.66 491.67 479.16 370.83 800-62.5 175-200 308.33-370.83 370.83-16.67 8.33-25 20.83-25 41.67V1700c0 16.67 8.33 29.17 25 33.33 4.17 0 12.5 0 16.67-4.16 395.83-125 612.5-545.84 487.5-941.67-75-237.5-258.34-416.67-487.5-491.67z"
        fill="#fff"
      />
    </svg>
  )
}

export function BaseIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 2500 2500"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="1250" cy="1250" r="1250" fill="#0052FF" />
      <path
        d="M1247.8,2500c691.6,0,1252.2-559.6,1252.2-1250C2500,559.6,1939.4,0,1247.8,0C591.7,0,53.5,503.8,0,1144.9h1655.1v210.2H0C53.5,1996.2,591.7,2500,1247.8,2500z"
        fill="white"
      />
    </svg>
  )
}

export function WETHIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 250 250"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M0 125C0 55.9644 55.9644 0 125 0C194.036 0 250 55.9644 250 125C250 194.036 194.036 250 125 250C55.9644 250 0 194.036 0 125Z"
        fill="#627EEA"
      />
      <path
        d="M125.047 30.5V100.351L184.086 126.732L125.047 30.5Z"
        fill="white"
        fillOpacity="0.602"
      />
      <path d="M125.047 30.5L66 126.732L125.047 100.351V30.5Z" fill="white" />
      <path
        d="M125.047 172V219.462L184.125 137.728L125.047 172Z"
        fill="white"
        fillOpacity="0.602"
      />
      <path d="M125.047 219.462V171.992L66 137.728L125.047 219.462Z" fill="white" />
      <path
        d="M125.047 161.013L184.086 126.733L125.047 100.368V161.013Z"
        fill="white"
        fillOpacity="0.2"
      />
      <path d="M66 126.733L125.047 161.013V100.368L66 126.733Z" fill="white" fillOpacity="0.602" />
    </svg>
  )
}

export function getTokenIcon(symbol: string, size?: number) {
  const iconSize = size ?? 24
  switch (symbol.toUpperCase()) {
    case 'USDC':
      return <USDCIcon size={iconSize} />
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
