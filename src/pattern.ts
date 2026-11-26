export type PatternKind = 'repeat' | 'sequence' | 'mirror' | 'abab' | 'ending' | 'custom'
export type Position = 'start' | 'middle' | 'end'
export type SeqDir = 'up' | 'down'
export type PlanError = 'prefix' | 'block' | 'fit' | 'seq' | 'mask' | 'empty' | 'digit'

export interface SearchInput {
  prefix: string
  blocks: string[]
  kind: PatternKind
  position: Position
  repeatDigit: number
  repeatLen: number
  seqStart: number
  seqLen: number
  seqDir: SeqDir
  pairA: number
  pairB: number
  ending: string
  customMask: string
  cap: number
}

export interface MaskPlan {
  block: string
  mask: string
  total: number
}

export type Plan =
  | {
      ok: true
      motif: string
      masks: MaskPlan[]
      total: number
      overlap: boolean
      queue: string[]
      sampled: boolean
    }
  | { ok: false; error: PlanError }

const LOCAL_LEN = 11
const SMALL_SPACE = 150
const MAX_CAP = 320

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

export function sampleIndexes(total: number, count: number): number[] {
  if (count <= 0 || total <= 0) return []
  if (count >= total) return Array.from({ length: total }, (_, i) => i)
  const out: number[] = []
  const step = total / count
  let prev = -1
  for (let i = 0; i < count; i++) {
    let idx = Math.min(total - 1, Math.floor(i * step + step / 2))
    if (idx <= prev) idx = Math.min(total - 1, prev + 1)
    out.push(idx)
    prev = idx
  }
  return out
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

function motifOf(input: SearchInput): { motif: string } | { error: PlanError } {
  switch (input.kind) {
    case 'repeat': {
      if (!digitOk(input.repeatDigit)) return { error: 'digit' }
      if (!Number.isInteger(input.repeatLen) || input.repeatLen < 2 || input.repeatLen > 6) return { error: 'fit' }
      return { motif: String(input.repeatDigit).repeat(input.repeatLen) }
    }
    case 'sequence': {
      const seq = sequence(input.seqStart, input.seqLen, input.seqDir)
      if (!seq) return { error: 'seq' }
      return { motif: seq }
    }
    case 'mirror': {
      if (!digitOk(input.pairA) || !digitOk(input.pairB)) return { error: 'digit' }
      return { motif: `${input.pairA}${input.pairB}${input.pairB}${input.pairA}` }
    }
    case 'abab': {
      if (!digitOk(input.pairA) || !digitOk(input.pairB)) return { error: 'digit' }
      return { motif: `${input.pairA}${input.pairB}${input.pairA}${input.pairB}` }
    }
    case 'ending': {
      if (!/^\d{2,6}$/.test(input.ending)) return { error: 'mask' }
      return { motif: input.ending }
    }
    case 'custom':
      return { motif: '' }
  }
}

function cleanBlocks(prefix: string, blocks: string[]): { blocks: string[] } | { error: PlanError } {
  const clean = [
    ...new Set(
      blocks
        .map((block) => block.replace(/\D/g, ''))
        .filter((block) => block.length > 0),
    ),
  ]
  if (!clean.length) return { error: 'empty' }
  for (const block of clean) {
    if (!block.startsWith(prefix) || block.length > 8) return { error: 'block' }
  }
  clean.sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
  return { blocks: clean }
}

function hasOverlap(blocks: string[]): boolean {
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (blocks[i].startsWith(blocks[j]) || blocks[j].startsWith(blocks[i])) return true
    }
  }
  return false
}

function enumerate(masks: MaskPlan[]): string[] {
  const set = new Set<string>()
  for (const plan of masks) {
    for (let i = 0; i < plan.total; i++) set.add(materialize(plan.mask, i))
  }
  return [...set]
}

function sampleAcross(masks: MaskPlan[], cap: number): string[] {
  const total = masks.reduce((sum, plan) => sum + plan.total, 0)
  if (total <= cap) return enumerate(masks)

  const raw = masks.map((plan) => (cap * plan.total) / total)
  const alloc = raw.map((value) => Math.floor(value))
  let used = alloc.reduce((sum, value) => sum + value, 0)
  const remainders = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index)
  for (const { index } of remainders) {
    if (used >= cap) break
    if (alloc[index] < masks[index].total) {
      alloc[index] += 1
      used += 1
    }
  }
  if (cap >= masks.length) {
    for (let i = 0; i < masks.length; i++) {
      if (alloc[i] > 0) continue
      const donor = alloc.findIndex((count, index) => index !== i && count > 1)
      if (donor >= 0) {
        alloc[donor] -= 1
        alloc[i] = 1
      }
    }
  }

  const set = new Set<string>()
  masks.forEach((plan, index) => {
    const count = Math.min(plan.total, alloc[index] ?? 0)
    for (const idx of sampleIndexes(plan.total, count)) set.add(materialize(plan.mask, idx))
  })
  return [...set].slice(0, cap)
}

export function buildPlan(input: SearchInput): Plan {
  if (input.prefix !== '018' && input.prefix !== '016') return { ok: false, error: 'prefix' }
  const cap = Math.max(20, Math.min(MAX_CAP, Math.floor(input.cap) || 80))

  if (input.kind === 'custom') {
    const mask = input.customMask.toUpperCase().replace(/[\s-]/g, '')
    if (!/^[0-9X]{11}$/.test(mask) || !mask.startsWith(input.prefix)) return { ok: false, error: 'mask' }
    const total = maskWidth(mask)
    const limit = total <= SMALL_SPACE ? total : Math.min(cap, total)
    const queue = sampleIndexes(total, limit).map((index) => materialize(mask, index))
    return {
      ok: true,
      motif: mask,
      masks: [{ block: input.prefix, mask, total }],
      total,
      overlap: false,
      queue,
      sampled: queue.length < total,
    }
  }

  const motifResult = motifOf(input)
  if ('error' in motifResult) return { ok: false, error: motifResult.error }
  const position: Position = input.kind === 'ending' ? 'end' : input.position
  const blocks = cleanBlocks(input.prefix, input.blocks)
  if ('error' in blocks) return { ok: false, error: blocks.error }

  const masks: MaskPlan[] = []
  for (const block of blocks.blocks) {
    const mask = placeMotif(block, motifResult.motif, position)
    if (!mask) return { ok: false, error: 'fit' }
    masks.push({ block, mask, total: maskWidth(mask) })
  }

  const total = masks.reduce((sum, plan) => sum + plan.total, 0)
  const overlap = hasOverlap(blocks.blocks)
  const limit = total <= SMALL_SPACE ? total : Math.min(cap, total)
  const queue = sampleAcross(masks, limit)
  return {
    ok: true,
    motif: motifResult.motif,
    masks,
    total,
    overlap,
    queue,
    sampled: queue.length < total,
  }
}
