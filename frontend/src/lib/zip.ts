/**
 * Minimal ZIP reader for the two-entry cipher bundle the API returns.
 *
 * The API stores entries uncompressed, but deflate is handled too so a bundle
 * re-zipped by the user still opens. Only local file headers are walked; the
 * bundle has no data descriptors, which keeps this a straight scan.
 */
export async function unzip(
  blob: Blob,
  mimeType = 'application/octet-stream',
): Promise<Map<string, File>> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()
  const files = new Map<string, File>()
  let offset = 0

  while (offset + 30 <= view.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const flags = view.getUint16(offset + 6, true)
    const method = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    if (flags & 0x08) throw new Error('ZIP entries with data descriptors are not supported.')

    const nameStart = offset + 30
    const dataStart = nameStart + nameLength + extraLength
    const dataEnd = dataStart + compressedSize
    if (dataEnd > bytes.byteLength) throw new Error('The ZIP file is truncated.')

    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength))
    const compressed = bytes.slice(dataStart, dataEnd)

    let data: Uint8Array<ArrayBuffer>
    if (method === 0) {
      data = compressed
    } else if (method === 8) {
      const stream = new Blob([compressed])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw'))
      data = new Uint8Array(await new Response(stream).arrayBuffer())
    } else {
      throw new Error(`Unsupported ZIP compression method ${method}.`)
    }

    // Directory entries and macOS resource forks are not payload.
    const base = name.split('/').pop() ?? name
    if (base && !name.startsWith('__MACOSX/')) {
      files.set(base, new File([data], base, { type: mimeType }))
    }
    offset = dataEnd
  }

  if (files.size === 0) throw new Error('That is not a valid ZIP file.')
  return files
}
