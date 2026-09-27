import { useMemo, useState } from 'react'

import type { Sample } from '@/lib/samples'
import type { KeyMode, KeyOptions } from '@/services/types'

/**
 * Key material for any panel that encrypts, decrypts or analyses a cipher.
 *
 * One hook so every such panel validates, words and forwards the key the
 * same way. Spread `selectorProps` into `KeySelector` and `options` into the
 * request.
 */
export function useKeyInput() {
  const [keyMode, setKeyMode] = useState<KeyMode>('passphrase')
  const [passphrase, setPassphrase] = useState('')
  const [keyFile, setKeyFile] = useState<File | null>(null)

  return useMemo(() => {
    const hasKey = keyMode === 'passphrase' ? passphrase.trim().length > 0 : keyFile !== null
    return {
      hasKey,
      /** Why the run is blocked when `hasKey` is false. */
      missingReason: keyMode === 'passphrase' ? 'Enter the passphrase.' : `Choose the key ${keyMode}.`,
      options: { keyMode, passphrase, keyFile } satisfies KeyOptions,
      /** Pass to a cipher dropzone's `onSampleLoaded` to fill in the sample's key. */
      applySampleKey: (sample: Sample) => {
        if (!sample.passphrase) return
        setKeyMode('passphrase')
        setKeyFile(null)
        setPassphrase(sample.passphrase)
      },
      selectorProps: {
        keyMode,
        onKeyModeChange: setKeyMode,
        passphrase,
        onPassphraseChange: setPassphrase,
        keyFile,
        onKeyFileChange: setKeyFile,
      },
    }
  }, [keyFile, keyMode, passphrase])
}
