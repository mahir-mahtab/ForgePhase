/** Shared HTTP transport. The only module that talks to the network. */

import type {
  Artifact,
  ArtifactResult,
  BackendInfo,
  Detail,
  OperationId,
  ServiceResult,
} from '@/services/types'

/** Same-origin by default; Vite proxies `/api` to the Python process. */
const API_BASE_URL: string = (
  import.meta.env.VITE_API_BASE_URL ?? '/api'
).replace(/\/$/, '')

const UNREACHABLE =
  'Backend unreachable. Start it and try again.'

/** FastAPI reports validation failures as a list of `{loc, msg}` objects. */
function describeDetail(detail: unknown): string | null {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item !== 'object' || item === null) return null
        const { loc, msg } = item as { loc?: unknown; msg?: unknown }
        const field = Array.isArray(loc) ? loc.filter((part) => part !== 'body').join('.') : ''
        return typeof msg === 'string' ? (field ? `${field}: ${msg}` : msg) : null
      })
      .filter(Boolean)
    return parts.length > 0 ? parts.join('; ') : null
  }
  return null
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    const message = describeDetail(body.detail)
    if (message) return capitalize(message)
  } catch {
    // Not JSON: typically the dev proxy answering for a backend that is down.
  }
  if (response.status >= 500) return UNREACHABLE
  return `Request failed (HTTP ${response.status}).`
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * POST and return the raw response, or an error result.
 *
 * Aborts are re-thrown so the caller's cancellation logic sees them; every
 * other failure becomes a value.
 */
async function post(
  operation: OperationId,
  endpoint: string,
  body: FormData | object,
  signal?: AbortSignal,
): Promise<Response | ServiceResult<never>> {
  const init: RequestInit =
    body instanceof FormData
      ? { method: 'POST', body, signal }
      : {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
          signal,
        }

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/${endpoint}`, init)
  } catch (error) {
    if (signal?.aborted) throw error
    return { status: 'error', operation, message: UNREACHABLE }
  }

  if (!response.ok) {
    return { status: 'error', operation, message: await errorMessage(response) }
  }
  return response
}

/** Build multipart form data from plain fields. */
export function form(fields: Record<string, string | Blob | undefined | null>): FormData {
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      body.set(key, value)
    }
  }
  return body
}

function responseFilename(response: Response, fallback: string): string {
  const disposition = response.headers.get('Content-Disposition')
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) return decodeURIComponent(encoded.replace(/^"|"$/g, ''))
  return disposition?.match(/filename="?([^";]+)"?/i)?.[1] ?? fallback
}

export function artifactFromFile(file: File): Artifact {
  return {
    file,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    byteLength: file.size,
  }
}

/** POST multipart form data and return the binary response as a file. */
export async function postArtifact(
  operation: OperationId,
  endpoint: string,
  body: FormData,
  fallbackName: string,
  details: Detail[],
  signal?: AbortSignal,
): Promise<ServiceResult<ArtifactResult>> {
  const response = await post(operation, endpoint, body, signal)
  if (!(response instanceof Response)) return response

  const blob = await response.blob()
  const name = responseFilename(response, fallbackName)
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' })
  return { status: 'ok', data: { artifact: artifactFromFile(file), details } }
}

/** POST and parse a JSON response through `parse`, which may throw. */
export async function postJson<T>(
  operation: OperationId,
  endpoint: string,
  body: FormData | object,
  parse: (raw: unknown) => T,
  signal?: AbortSignal,
): Promise<ServiceResult<T>> {
  const response = await post(operation, endpoint, body, signal)
  if (!(response instanceof Response)) return response

  try {
    return { status: 'ok', data: parse(await response.json()) }
  } catch (error) {
    if (signal?.aborted) throw error
    return {
      status: 'error',
      operation,
      message: error instanceof Error ? error.message : 'The backend sent an unreadable reply.',
    }
  }
}

/** `GET /api/info`, or null when the backend is not answering. */
export async function fetchBackendInfo(signal?: AbortSignal): Promise<BackendInfo | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/info`, { signal })
    if (!response.ok) return null
    const body = (await response.json()) as {
      version: string
      limits: {
        max_image_pixels: number
        max_audio_samples: number
        max_audio_channels: number
      }
    }
    return {
      version: body.version,
      limits: {
        maxImagePixels: body.limits.max_image_pixels,
        maxAudioSamples: body.limits.max_audio_samples,
        maxAudioChannels: body.limits.max_audio_channels,
      },
    }
  } catch {
    return null
  }
}
