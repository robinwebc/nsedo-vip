import type { Brand } from './operators.ts'
import type { Availability } from './api.ts'
import { matchesMask, toIntl, toLocal } from './pattern.ts'
import { sleep } from './sleep.ts'

export const REQUEST_GAP_MS = 560
const FAIL_LIMIT = 5

export interface Hit {
  local: string
  intl: string
}

export interface Progress {
  checked: number
  failed: number
  found: number
  total: number
}

export interface ScanOutcome {
  hits: Hit[]
  checked: number
  failed: number
  status: 'done' | 'stopped' | 'error'
}

export interface ScanOptions {
  queue: string[]
  masks: string[]
  brand: Brand
  prefix: string
  signal: AbortSignal
  gapMs?: number
  workers?: number
  check: (intl: string, brand: Brand, signal: AbortSignal) => Promise<Availability>
  onHit?: (hit: Hit) => void
  onProgress?: (progress: Progress) => void
}

function createGate(gapMs: number, signal: AbortSignal) {
  let next = 0
  return async function take() {
    const now = Date.now()
    const at = Math.max(now, next)
    next = at + gapMs
    const wait = at - now
    if (wait > 0) await sleep(wait, signal)
  }
}

export async function scan(options: ScanOptions): Promise<ScanOutcome> {
  const hits: Hit[] = []
  const seen = new Set<string>()
  const gap = options.gapMs ?? REQUEST_GAP_MS
  const gate = createGate(gap, options.signal)
  let cursor = 0
  let checked = 0
  let failed = 0
  let failStreak = 0
  let halt: ScanOutcome['status'] | null = null

  const report = () => {
    options.onProgress?.({ checked, failed, found: hits.length, total: options.queue.length })
  }

  const consider = (local: string) => {
    if (seen.has(local)) return
    if (!local.startsWith(options.prefix) || !/^01\d{9}$/.test(local)) return
    if (!options.masks.some((mask) => matchesMask(mask, local))) return
    seen.add(local)
    const hit = { local, intl: toIntl(local) }
    hits.push(hit)
    options.onHit?.(hit)
  }

  const worker = async () => {
    for (;;) {
      if (options.signal.aborted) {
        halt = halt ?? 'stopped'
        return
      }
      if (halt) return
      const index = cursor
      cursor += 1
      const local = options.queue[index]
      if (local === undefined) return
      if (seen.has(local)) {
        checked += 1
        report()
        continue
      }
      try {
        await gate()
      } catch {
        halt = halt ?? 'stopped'
        return
      }
      if (options.signal.aborted || halt) {
        halt = halt ?? 'stopped'
        return
      }
      try {
        const result = await options.check(toIntl(local), options.brand, options.signal)
        failStreak = 0
        checked += 1
        if (result.available) consider(local)
        for (const raw of result.free) {
          const extra = toLocal(raw)
          if (extra) consider(extra)
        }
      } catch {
        if (options.signal.aborted) {
          halt = halt ?? 'stopped'
          return
        }
        failed += 1
        checked += 1
        failStreak += 1
        if (failStreak >= FAIL_LIMIT) {
          halt = 'error'
          report()
          return
        }
      }
      report()
    }
  }

  const workers = Math.max(1, Math.min(options.workers ?? 2, options.queue.length || 1))
  await Promise.all(Array.from({ length: workers }, () => worker()))
  report()
  return {
    hits,
    checked,
    failed,
    status: halt ?? 'done',
  }
}
