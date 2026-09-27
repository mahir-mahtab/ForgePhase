import type { KeyMode } from '@/services/types'

/**
 * Build a copy-pasteable `phaseforge` command line.
 *
 * Arguments containing spaces or shell metacharacters are double-quoted, so a
 * file called `my photo.png` still works when pasted into a terminal.
 */
export function cliCommand(...parts: Array<string | number | false | null | undefined>): string {
  return parts
    .filter(
      (part): part is string | number =>
        part !== false && part !== null && part !== undefined && part !== '',
    )
    .map((part) => quote(String(part)))
    .join(' ')
}

/**
 * The key flags for a command. A passphrase is left off: the CLI prompts for
 * it, which keeps it out of shell history.
 */
export function keyCliArgs(keyMode: KeyMode, keyFile: File | null): string[] {
  if (keyMode === 'image') return ['--key-image', keyFile?.name ?? 'key.png']
  if (keyMode === 'audio') return ['--key-audio', keyFile?.name ?? 'key.wav']
  return []
}

const SAFE = /^[\w@%+=:,./-]+$/

export function quote(argument: string): string {
  if (SAFE.test(argument)) return argument
  // Inside double quotes a POSIX shell still expands these four characters.
  return `"${argument.replace(/["\\$`]/g, (character) => `\\${character}`)}"`
}
