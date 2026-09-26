/** Shared transport helpers for connected and placeholder operations. */

import type {
  ArtifactResult,
  CipherPairResult,
  OperationId,
  ServiceResult,
} from '@/services/types'

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
  ['watermark-analyze', 'Watermark analysis'],
  ['filter', 'Frequency filtering'],
  ['spectrum', 'Spectrum preview'],
  ['audio-encrypt', 'Audio encryption'],
  ['audio-decrypt', 'Audio decryption'],
  ['denoise', 'Denoising'],
  ['enhance', 'Speech enhancement'],
  ['attack-report', 'Robustness report'],
  ['image-key-sensitivity', 'Key sensitivity analysis'],
  ['audio-analysis', 'Audio Fourier analysis'],
  ['audio-security-report', 'Audio security analysis'],
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
 * POST a multipart form to a JSON endpoint.
 *
 * The endpoint path mirrors the CLI command name exactly.
 */
export async function postForm<T>(
  operation: OperationId,
  body: FormData,
  signal?: AbortSignal,
  endpoint: string = operation,
): Promise<ServiceResult<T>> {
  const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
    method: 'POST',
    body,
    signal,
  })

  if (!response.ok) {
     return {
    status: 'error',
    operation,
    message: await errorMessage(response),
  }
}
  return { status: 'ok', data: (await response.json()) as T }
}

function responseFilename(response: Response, fallback: string): string {
  const disposition = response.headers.get('Content-Disposition')
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) return decodeURIComponent(encoded.replace(/^"|"$/g, ''))

  return disposition?.match(/filename="?([^";]+)"?/i)?.[1] ?? fallback
}

async function errorMessage(response: Response): Promise<string> {
  const fallback = `Request failed (HTTP ${response.status}).`

  try {
    const body = (await response.json()) as { detail?: unknown }
    return typeof body.detail === 'string' ? body.detail : fallback
  } catch {
    return fallback
  }
}

/** POST multipart form data and expose a binary response as a download. */
export async function postArtifact(
  operation: OperationId,
  endpoint: string,
  body: FormData,
  fallbackName: string,
  details: ArtifactResult['details'],
  signal?: AbortSignal,
): Promise<ServiceResult<ArtifactResult>> {
  const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
    method: 'POST',
    body,
    signal,
  })

  if (!response.ok) {
    return {
      status: 'error',
      operation,
      message: await errorMessage(response),
    }
  }

  const blob = await response.blob()
  return {
    status: 'ok',
    data: {
      artifact: {
        name: responseFilename(response, fallbackName),
        mimeType: blob.type || 'application/octet-stream',
        byteLength: blob.size,
        url: URL.createObjectURL(blob),
      },
      details,
    },
  }
}

/** POST an image encryption request and unpack its two-file ZIP response. */
export async function postCipherPair(
  operation: OperationId,
  endpoint: string,
  body: FormData,
  details: CipherPairResult['details'],
  signal?: AbortSignal,
): Promise<ServiceResult<CipherPairResult>> {
  const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
    method: 'POST',
    body,
    signal,
  })

  if (!response.ok) {
    return {
      status: 'error',
      operation,
      message: await errorMessage(response),
    }
  }

  const bundle = await response.blob()
  try {
    const files = await unzipPair(bundle)
    const real = files.get('cipher-real.png')
    const imaginary = files.get('cipher-imaginary.png')
    if (!real || !imaginary) throw new Error('cipher pair is missing a component')

    return {
      status: 'ok',
      data: {
        real: artifactFromFile(real),
        imaginary: artifactFromFile(imaginary),
        bundle: {
          name: responseFilename(response, 'cipher-pair.zip'),
          mimeType: bundle.type || 'application/zip',
          byteLength: bundle.size,
          url: URL.createObjectURL(bundle),
        },
        details,
      },
    }
  } catch (error) {
    return {
      status: 'error',
      operation,
      message: error instanceof Error ? error.message : 'Could not unpack cipher pair.',
    }
  }
}

function artifactFromFile(file: File): CipherPairResult['real'] {
  return {
    name: file.name,
    mimeType: file.type || 'image/png',
    byteLength: file.size,
    url: URL.createObjectURL(file),
  }
}

/** Minimal ZIP reader for the two deterministic PNG entries returned by the API. */
async function unzipPair(blob: Blob): Promise<Map<string, File>> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const files = new Map<string, File>()
  let offset = 0
  while (offset + 30 <= view.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength))
    const dataStart = nameStart + nameLength + extraLength
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize)
    let data: Uint8Array
    if (method === 0) {
      data = compressed
    } else if (method === 8) {
      const compressedCopy = compressed.slice()
      const stream = new Blob([compressedCopy]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      data = new Uint8Array(await new Response(stream).arrayBuffer())
    } else {
      throw new Error(`Unsupported ZIP compression method ${method}.`)
    }
    const dataCopy = data.slice()
    files.set(name, new File([dataCopy], name, { type: 'image/png' }))
    offset = dataStart + compressedSize
  }
  if (files.size === 0) throw new Error('The API returned an invalid cipher ZIP.')
  return files
}
