import { memo, useMemo } from 'react'

import { formatMetric, humanizeKey } from '@/lib/format'
import type { RobustnessReport } from '@/services/types'

/** Preferred column order; anything unlisted is appended alphabetically. */
const COLUMN_ORDER = ['correlation', 'psnrDb', 'snrDb', 'segmentalSnrDb', 'mse']

const COLUMN_LABELS = new Map([
  ['mse', 'MSE'],
  ['psnrDb', 'PSNR (dB)'],
  ['snrDb', 'SNR (dB)'],
  ['segmentalSnrDb', 'Seg. SNR (dB)'],
  ['correlation', 'Correlation'],
])

function MetricsTableImpl({ report }: { report: RobustnessReport }) {
  // One pass builds the column set and preserves the preferred order, instead
  // of scanning every row again per candidate column.
  const columns = useMemo(() => {
    const seen = new Set<string>()
    for (const row of report.rows) {
      for (const key of Object.keys(row.metrics)) seen.add(key)
    }

    const ordered = COLUMN_ORDER.filter((key) => seen.has(key))
    const rest = [...seen].filter((key) => !COLUMN_ORDER.includes(key)).sort()
    return [...ordered, ...rest]
  }, [report.rows])

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted">
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
              Attack
            </th>
            {columns.map((column) => (
              <th
                key={column}
                className="px-4 py-2.5 text-right font-medium whitespace-nowrap text-muted-foreground"
              >
                {COLUMN_LABELS.get(column) ?? humanizeKey(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => (
            <tr key={row.attack} className="border-t border-border">
              <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                {humanizeKey(row.attack)}
              </td>
              {columns.map((column) => {
                // The two metric shapes share no index signature, so widen once
                // rather than branching on the report kind per cell.
                const values = row.metrics as unknown as Record<
                  string,
                  number | undefined
                >
                const value = values[column]
                return (
                  <td
                    key={column}
                    className="tabular px-4 py-2.5 text-right font-mono text-xs"
                  >
                    {value === undefined ? (
                      <span className="text-muted-foreground">&mdash;</span>
                    ) : (
                      formatMetric(value)
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const MetricsTable = memo(MetricsTableImpl)
