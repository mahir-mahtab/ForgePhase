import { SECTIONS } from '@/lib/navigation'
import type { DomainKind } from '@/services/types'

/** Section eyebrow, serif tool title and a one-line description, from the nav config. */
export function WorkspaceHeader({ section, tool }: { section: DomainKind; tool: string }) {
  const group = SECTIONS.find((item) => item.id === section)
  const item = group?.tools.find((entry) => entry.value === tool)
  if (!group || !item) return null

  return (
    <div className="flex flex-col gap-3 pb-2">
      <p className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        <group.icon className="size-3.5" aria-hidden />
        {group.label} tools
      </p>
      <h1 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
        {item.label}
      </h1>
      <p className="max-w-[60ch] text-base text-muted-foreground">{item.description}</p>
    </div>
  )
}
