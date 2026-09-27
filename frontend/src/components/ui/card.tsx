import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-[0_1px_2px_rgb(26_26_26/0.04),0_8px_24px_-12px_rgb(26_26_26/0.08)]',
        className,
      )}
      {...props}
    />
  )
}

export { Card }
