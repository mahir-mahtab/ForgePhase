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

const SAFE = /^[\w@%+=:,./-]+$/

export function quote(argument: string): string {
  if (SAFE.test(argument)) return argument
  // Inside double quotes a POSIX shell still expands these four characters.
  return `"${argument.replace(/["\\$`]/g, (character) => `\\${character}`)}"`
}
