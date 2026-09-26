import type { ReactNode } from 'react'

/** Keeps a tool mounted while hidden, so its inputs and results survive navigation. */
export function ToolPanel({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div hidden={!active} className="flex flex-col gap-6">
      {children}
    </div>
  )
}
