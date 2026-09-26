/** File-picker `accept` strings, matching what Pillow and soundfile read. */
export const ACCEPT_IMAGE = '.png,.jpg,.jpeg,.bmp,.tif,.tiff,.webp,.gif'
export const ACCEPT_PNG = '.png'
export const ACCEPT_AUDIO = '.wav,.flac,.ogg,.aiff,.aif'
/** The noise-like cipher WAV `io/audio_cipher.py` writes. */
export const ACCEPT_CIPHER_WAV = '.wav'
/**
 * Key files: the key is a hash of the decoded pixels or samples. JPEG is
 * allowed, but lossy decoders can differ by a value between machines.
 */
export const ACCEPT_KEY_IMAGE = '.png,.jpg,.jpeg,.bmp,.tif,.tiff'
export const ACCEPT_KEY_AUDIO = '.wav,.flac,.aiff,.aif'
