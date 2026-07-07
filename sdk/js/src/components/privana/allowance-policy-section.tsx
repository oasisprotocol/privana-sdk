'use client'

import { useState, type ReactNode } from 'react'
import type { Allowance, AllowanceTerm } from '@/sdk/types/allowance'
import { cn } from '@/lib/utils'
import { ChevronDownIcon, CircleCheckIcon, CircleXIcon, ArrowRightIcon } from './icons'
import { PrivanaIcon } from './privana-icon'

function PolicyTermRow({
  term,
  kind,
}: {
  term: AllowanceTerm
  kind: 'permission' | 'restriction'
}) {
  return (
    <div className="flex gap-2">
      <div
        className={cn(
          'mt-0.5 shrink-0',
          kind === 'permission' ? 'text-emerald-500' : 'text-orange-500'
        )}
      >
        {kind === 'permission' ? <CircleCheckIcon /> : <CircleXIcon />}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-foreground text-sm leading-5 font-medium">{term.title}</span>
        <span className="text-muted-foreground text-sm leading-5">{term.description}</span>
      </div>
    </div>
  )
}

export function AllowancePolicySection({
  allowance,
  serviceName,
  serviceIcon,
}: {
  allowance: Allowance
  serviceName: string
  serviceIcon?: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const permissions = allowance.terms?.permissions ?? []
  const restrictions = allowance.terms?.restrictions ?? []
  const hasTerms = permissions.length > 0 || restrictions.length > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg">
          {serviceIcon}
        </div>
        <ArrowRightIcon className="text-muted-foreground" />
        <PrivanaIcon size={32} />
      </div>

      <p className="text-sm leading-5">
        <span className="text-foreground font-medium">{serviceName}</span>{' '}
        <span className="text-muted-foreground">wants a policy on your Privana account.</span>
      </p>

      {hasTerms && (
        <>
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            className="flex w-full cursor-pointer items-center gap-2"
          >
            <span className="bg-border h-px flex-1" />
            <span className="text-muted-foreground text-[10px] leading-[14px] font-medium tracking-[0.2px] whitespace-nowrap uppercase">
              {collapsed ? 'Show details' : 'Hide details'}
            </span>
            <ChevronDownIcon
              direction={collapsed ? 'down' : 'up'}
              className="text-foreground shrink-0"
            />
            <span className="bg-border h-px flex-1" />
          </button>

          {!collapsed && (
            <div className="flex flex-col gap-4">
              {permissions.map((term, i) => (
                <PolicyTermRow key={`permission-${i}`} term={term} kind="permission" />
              ))}
              {restrictions.map((term, i) => (
                <PolicyTermRow key={`restriction-${i}`} term={term} kind="restriction" />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
