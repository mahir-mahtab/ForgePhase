import { memo, useMemo } from 'react'

import { formatMetric, humanizeKey } from '@/lib/format'
import type { RobustnessReport } from '@/services/types'

/** Preferred column order; anything unlisted is appended alphabetically. */
const COLUMN_ORDER = ['correlation', 'psnr_db', 'snr_db', 'segmental_snr_db', 'mse']

const COLUMN_LABELS: Record<string, string> = {
  mse: 'MSE',
  psnr_db: 'PSNR (dB)',
  snr_db: 'SNR (dB)',
  segmental_snr_db: 'Seg. SNR (dB)',
  correlation: 'Correlation',
}

const ATTACK_LABELS: Record<string, string> = {
  none: 'No damage',
  noise_5pct: 'Noise, 5%',
  noise_20pct: 'Noise, 20%',
  occlusion_10pct: 'Occlusion, 10%',
  quantize_8bit: 'Quantized to 8 bits',
  quantize_16bit: 'Quantized to 16 bits',
}

function MetricsTableImpl({ report }: { report: RobustnessReport }) {
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
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted text-left">
              <th scope="col" className="px-3 py-2 font-medium text-muted-foreground">
                Damage
              </th>
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-3 py-2 text-right font-medium whitespace-nowrap text-muted-foreground"
                >
                  {COLUMN_LABELS[column] ?? humanizeKey(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.attack} className="border-t border-border">
                <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap">
                  {ATTACK_LABELS[row.attack] ?? humanizeKey(row.attack)}
                </th>
                {columns.map((column) => {
                  const value = row.metrics[column]
                  return (
                    <td key={column} className="tabular px-3 py-2 text-right font-mono text-xs">
                      {value === undefined ? (
                        <span className="text-muted-foreground">—</span>
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
      <p className="text-xs text-muted-foreground">
        Correlation near 1 means the plaintext survived; near 0 means it was
        lost. ∞ is an exact reconstruction.
      </p>
    </div>
  )
}

export const MetricsTable = memo(MetricsTableImpl)
