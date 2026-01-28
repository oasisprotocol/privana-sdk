'use client'

import { useState, type ReactNode, type ComponentProps, type ReactElement } from 'react'
import { useAccount } from 'wagmi'
import { Button, type buttonVariants } from '@/components/ui/button'
import { EncumberedWalletModal } from './encumbered-wallet-modal'
import { cn } from '@/lib/utils'
import type { VariantProps } from 'class-variance-authority'

type ButtonVariantProps = VariantProps<typeof buttonVariants>

export interface EncumberedWalletButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  children?: ReactNode
  variant?: ButtonVariantProps['variant']
  size?: ButtonVariantProps['size']
  asChild?: boolean
  renderButton?: (props: { onClick: () => void; isOpen: boolean }) => ReactElement
  hideWhenDisconnected?: boolean
}

export function EncumberedWalletButton({
  children,
  className,
  variant = 'outline',
  size = 'default',
  asChild = false,
  renderButton,
  hideWhenDisconnected = true,
  ...buttonProps
}: EncumberedWalletButtonProps) {
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
      {children ?? 'Encumbered Wallet'}
    </Button>
  )

  return (
    <>
      {buttonElement}
      <EncumberedWalletModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  )
}
