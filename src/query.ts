import { OPERATORS, type Brand, type OperatorId } from './operators.ts'
import { maskWidth, materialize, placeMotif, type Position } from './pattern.ts'

export interface Job {
  mask: string
  brand: Brand
  prefix: string
  total: number
}

export interface Candidate {
  local: string
  brand: Brand
  prefix: string
  mask: string
}

export interface ReadyPlan {
  ok: true
  label: string
  jobs: Job[]
  total: number
}

export type QueryError = 'empty' | 'mask' | 'prefix' | 'long' | 'fit'

export type QueryPlan = ReadyPlan | { ok: false; error: QueryError }

export interface QueryOptions {
  operators: 'all' | OperatorId
  position: Position
  block: string
}

export interface CandidateCursor {
  total: number
  next(): Candidate | null
}

function chosen(which: QueryOptions['operators']) {
  if (which === 'all') return OPERATORS
  return OPERATORS.filter((op) => op.id === which)
}

function job(mask: string, op: { brand: Brand; prefix: string }): Job {
  return { mask, brand: op.brand, prefix: op.prefix, total: maskWidth(mask) }
}

function ready(label: string, jobs: Job[]): ReadyPlan {
  return { ok: true, label, jobs, total: jobs.reduce((sum, item) => sum + item.total, 0) }
}

/** Stretch the first run of X so the mask is 11 places. */
export function expandMask(raw: string): string | null {
  if (raw.length === 11) return raw
  if (raw.length > 11 || !raw.includes('X')) return null
  const at = raw.indexOf('X')
  let end = at
  while (raw[end] === 'X') end += 1
  return raw.slice(0, end) + 'X'.repeat(11 - raw.length) + raw.slice(end)
}

function motifPlan(motif: string, position: Position, ops: typeof OPERATORS, block: string): QueryPlan {
  const jobs: Job[] = []
  for (const op of ops) {
    let stem = op.prefix
    if (block) {
      if (!block.startsWith(op.prefix)) {
        if (ops.length === 1) return { ok: false, error: 'prefix' }
        continue
      }
      stem = block
    }
    const mask = placeMotif(stem, motif, position)
    if (!mask) return { ok: false, error: 'fit' }
    jobs.push(job(mask, op))
  }
  if (!jobs.length) return { ok: false, error: 'prefix' }
  return ready(motif, jobs)
}

export function parseQuery(raw: string, options: QueryOptions): QueryPlan {
  const text = raw.toUpperCase().replace(/[\s.-]/g, '')
  if (!text) return { ok: false, error: 'empty' }
  if (!/^[0-9X]+$/.test(text)) return { ok: false, error: 'mask' }
  if (text.length > 11) return { ok: false, error: 'long' }

  const ops = chosen(options.operators)
  const block = options.block.replace(/\D/g, '')

  if (!text.includes('X')) {
    if (text.startsWith('018') || text.startsWith('016')) {
      const op = ops.find((item) => text.startsWith(item.prefix))
      if (!op) return { ok: false, error: 'prefix' }
      if (text.length < 3) return { ok: false, error: 'mask' }
      const mask = text + 'X'.repeat(11 - text.length)
      return ready(mask, [job(mask, op)])
    }
    if (text.length > 8) return { ok: false, error: 'long' }
    return motifPlan(text, options.position, ops, block)
  }

  if (text.length === 11 && text.startsWith('01X')) {
    return ready(
      text,
      ops.map((op) => job(op.prefix + text.slice(3), op)),
    )
  }

  const owner = ops.find((op) => text.startsWith(op.prefix))
  if (owner) {
    const mask = expandMask(text)
    if (!mask || !mask.startsWith(owner.prefix)) return { ok: false, error: 'mask' }
    return ready(mask, [job(mask, owner)])
  }

  const jobs: Job[] = []
  for (const op of ops) {
    const combined = op.prefix + text
    if (combined.length > 11) return { ok: false, error: 'fit' }
    const mask = expandMask(combined)
    if (!mask) return { ok: false, error: 'mask' }
    jobs.push(job(mask, op))
  }
  return ready(text, jobs)
}

/** Last N digits are the same digit, for every digit 0–9. */
export function planSameEnding(length: 3 | 4, options: QueryOptions): QueryPlan {
  const jobs: Job[] = []
  const ops = chosen(options.operators)
  const block = options.block.replace(/\D/g, '')
  for (let digit = 0; digit <= 9; digit++) {
    const part = motifPlan(String(digit).repeat(length), 'end', ops, block)
    if (!part.ok) return part
    jobs.push(...part.jobs)
  }
  return ready(length === 3 ? 'same3' : 'same4', jobs)
}

/** Walk every candidate, alternating operators and motifs. No cap. */
export function createCursor(jobs: Job[]): CandidateCursor {
  const index = jobs.map(() => 0)
  let turn = 0
  const total = jobs.reduce((sum, item) => sum + item.total, 0)
  return {
    total,
    next() {
      if (!jobs.length) return null
      for (let step = 0; step < jobs.length; step++) {
        const at = (turn + step) % jobs.length
        const jobItem = jobs[at]
        if (index[at] >= jobItem.total) continue
        const local = materialize(jobItem.mask, index[at])
        index[at] += 1
        turn = (at + 1) % jobs.length
        return { local, brand: jobItem.brand, prefix: jobItem.prefix, mask: jobItem.mask }
      }
      return null
    },
  }
}
