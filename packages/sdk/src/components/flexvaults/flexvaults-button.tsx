'use client'

import { useState, type ReactNode, type ComponentProps, type ReactElement } from 'react'
import { useAccount } from 'wagmi'
import { Button, type buttonVariants } from '@/components/ui/button'
import { FlexvaultsModal } from './flexvaults-modal'
import { cn } from '@/lib/utils'
import type { VariantProps } from 'class-variance-authority'

type ButtonVariantProps = VariantProps<typeof buttonVariants>

export interface FlexvaultsButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  children?: ReactNode
  variant?: ButtonVariantProps['variant']
  size?: ButtonVariantProps['size']
  asChild?: boolean
  renderButton?: (props: { onClick: () => void; isOpen: boolean }) => ReactElement
  hideWhenDisconnected?: boolean
  showLockedFunds?: boolean
  defaultTab?: 'deposit' | 'withdraw'
}

export function FlexvaultsButton({
  children,
  className,
  variant = 'outline',
  size = 'default',
  asChild = false,
  renderButton,
  hideWhenDisconnected = true,
  showLockedFunds = true,
  defaultTab,
  ...buttonProps
}: FlexvaultsButtonProps) {
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
      {children ?? 'Flexvaults'}
    </Button>
  )

  return (
    <span data-flexvaults className="contents">
      {buttonElement}
      <FlexvaultsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        showLockedFunds={showLockedFunds}
        defaultTab={defaultTab}
      />
    </span>
  )
}
