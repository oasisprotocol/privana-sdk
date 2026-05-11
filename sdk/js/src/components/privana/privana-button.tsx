'use client'

import { useState, type ReactNode, type ComponentProps, type ReactElement } from 'react'
import { useAccount } from 'wagmi'
import { Button, type buttonVariants } from '@/components/ui/button'
import { PrivanaModal } from './privana-modal'
import { cn } from '@/lib/utils'
import type { VariantProps } from 'class-variance-authority'

type ButtonVariantProps = VariantProps<typeof buttonVariants>

export interface PrivanaButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  children?: ReactNode
  variant?: ButtonVariantProps['variant']
  size?: ButtonVariantProps['size']
  asChild?: boolean
  renderButton?: (props: { onClick: () => void; isOpen: boolean }) => ReactElement
  hideWhenDisconnected?: boolean
  showLockedFunds?: boolean
  defaultTab?: 'deposit' | 'withdraw'
  onDepositSuccess?: () => void
}

export function PrivanaButton({
  children,
  className,
  variant = 'outline',
  size = 'default',
  asChild = false,
  renderButton,
  hideWhenDisconnected = true,
  showLockedFunds = true,
  defaultTab,
  onDepositSuccess,
  ...buttonProps
}: PrivanaButtonProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const { isConnected } = useAccount()

  if (hideWhenDisconnected && !isConnected) {
    return null
  }

  const handleClick = () => setModalOpen(true)

  const buttonElement = renderButton ? (
    renderButton({ onClick: handleClick, isOpen: modalOpen })
  ) : (
    <Button
      variant={variant}
      size={size}
      asChild={asChild}
      className={cn(className)}
      onClick={handleClick}
      disabled={!isConnected}
      {...buttonProps}
    >
      {children ?? 'Privana'}
    </Button>
  )

  return (
    <span data-privana className="contents">
      {buttonElement}
      <PrivanaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        showLockedFunds={showLockedFunds}
        defaultTab={defaultTab}
        onDepositSuccess={onDepositSuccess}
      />
    </span>
  )
}
