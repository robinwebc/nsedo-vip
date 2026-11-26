export type Position = 'start' | 'middle' | 'end'
export type SeqDir = 'up' | 'down'

const LOCAL_LEN = 11

export function digitOk(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 9
}

export function sequence(start: number, len: number, dir: SeqDir): string | null {
  if (!digitOk(start) || !Number.isInteger(len) || len < 3 || len > 6) return null
  const step = dir === 'up' ? 1 : -1
  const end = start + step * (len - 1)
  if (end < 0 || end > 9) return null
  let out = ''
  for (let i = 0; i < len; i++) out += String(start + step * i)
  return out
}

export function placeMotif(block: string, motif: string, position: Position): string | null {
  if (!/^\d+$/.test(block) || !/^\d+$/.test(motif)) return null
  if (block.length + motif.length > LOCAL_LEN) return null
  const wild = LOCAL_LEN - block.length - motif.length
  if (position === 'end') return block + 'X'.repeat(wild) + motif
  if (position === 'start') return block + motif + 'X'.repeat(wild)
  const left = Math.floor(wild / 2)
  const right = wild - left
  return block + 'X'.repeat(left) + motif + 'X'.repeat(right)
}

export function maskWidth(mask: string): number {
  let wild = 0
  for (const ch of mask) if (ch === 'X') wild += 1
  return 10 ** wild
}

export function materialize(mask: string, index: number): string {
  const chars = mask.split('')
  let n = index
  for (let i = chars.length - 1; i >= 0; i--) {
    if (chars[i] === 'X') {
      chars[i] = String(n % 10)
      n = Math.floor(n / 10)
    }
  }
  return chars.join('')
}

export function matchesMask(mask: string, local: string): boolean {
  if (local.length !== mask.length) return false
  for (let i = 0; i < mask.length; i++) {
    const expect = mask[i]
    if (expect !== 'X' && expect !== local[i]) return false
  }
  return true
}

export function toIntl(local: string): string {
  return '88' + local
}

export function toLocal(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 13 && digits.startsWith('880')) return '0' + digits.slice(3)
  if (digits.length === 11 && digits.startsWith('01')) return digits
  return null
}
