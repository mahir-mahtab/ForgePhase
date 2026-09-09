/**
 * Transport stub.
 *
 * The Python backend is not connected yet. Every service routes through
 * `notImplemented`, which resolves -- after a short, honest pause so loading
 * states are exercised -- with a `not-implemented` envelope. When the HTTP
 * layer lands, only this file and the call sites inside the two service
 * modules change; component code keeps the same contract.
 */

import type { OperationId, ServiceResult } from '@/services/types'

/** Same-origin by default; Vite proxies `/api` to the Python process. */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? '/api'

/** Long enough to see a spinner, short enough not to feel broken. */
const STUB_LATENCY_MS = 420

/** Human-readable labels, kept out of the render path. */
const OPERATION_LABELS = new Map<OperationId, string>([
  ['image-encrypt', 'Image encryption'],
  ['image-decrypt', 'Image decryption'],
  ['watermark-embed', 'Watermark embedding'],
  ['watermark-extract', 'Watermark extraction'],
  ['filter', 'Frequency filtering'],
  ['spectrum', 'Spectrum preview'],
  ['audio-encrypt', 'Audio encryption'],
  ['audio-decrypt', 'Audio decryption'],
  ['denoise', 'Denoising'],
  ['enhance', 'Speech enhancement'],
  ['attack-report', 'Robustness report'],
])

export function operationLabel(operation: OperationId): string {
  return OPERATION_LABELS.get(operation) ?? operation
}

/** Thrown when the caller aborts; distinguished from a backend failure. */
export class AbortedError extends Error {
  constructor() {
    super('Operation cancelled')
    this.name = 'AbortedError'
  }
}

/**
 * Stand-in for a real request. Resolves with `not-implemented`.
 *
 * Honours `signal` so cancellation already works end to end, and the timer is
 * always cleared -- a pending timer would otherwise keep the callback alive
 * after the component that started it unmounted.
 */
export function notImplemented<T>(
  operation: OperationId,
  signal?: AbortSignal,
): Promise<ServiceResult<T>> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortedError())
      return
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve({
        status: 'not-implemented',
        operation,
        message: `${operationLabel(operation)} is not wired to a backend yet. The request shape is ready; only the transport is missing.`,
      })
    }, STUB_LATENCY_MS)

    function onAbort() {
      clearTimeout(timer)
      reject(new AbortedError())
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Reference implementation for when the backend exists. Nothing calls it yet;
 * it documents the intended shape so the switch is mechanical.
 *
 * The endpoint path mirrors the CLI command name exactly.
 */
export async function postForm<T>(
  operation: OperationId,
  body: FormData,
  signal?: AbortSignal,
): Promise<ServiceResult<T>> {
  const response = await fetch(`${API_BASE_URL}/${operation}`, {
    method: 'POST',
    body,
    signal,
  })

  if (!response.ok) {
    return {
      status: 'error',
      operation,
      message: `${operationLabel(operation)} failed (HTTP ${response.status}).`,
    }
  }

  return { status: 'ok', data: (await response.json()) as T }
}
