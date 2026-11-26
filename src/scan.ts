import type { Brand } from './operators.ts'
import type { Availability } from './api.ts'
import type { Candidate, CandidateCursor } from './query.ts'
import { matchesMask, toIntl, toLocal } from './pattern.ts'
import { sleep } from './sleep.ts'

export const REQUEST_GAP_MS = 560
const FAIL_LIMIT = 5

export interface Hit {
  local: string
  intl: string
  brand: Brand
}

export interface Progress {
  checked: number
  failed: number
  found: number
  total: number
  rateLimits: number
}

export interface ScanOutcome {
  hits: Hit[]
  checked: number
  failed: number
  rateLimits: number
  status: 'done' | 'stopped' | 'paused'
}

export interface ScanOptions {
  cursor: CandidateCursor
  masks: string[]
  signal: AbortSignal
  gapMs?: number
  workers?: number
  check: (intl: string, brand: Brand, signal: AbortSignal) => Promise<Availability>
  lookup?: (local: string, brand: Brand) => 'open' | 'taken' | 'miss'
  remember?: (local: string, brand: Brand, available: boolean) => void
  onHit?: (hit: Hit) => void
  onProgress?: (progress: Progress) => void
  onPause?: () => void
  onRateLimit?: () => void
  /** Called after repeated failures. Resolve to continue; reject or abort to stop. */
  waitForResume?: (signal: AbortSignal) => Promise<void>
}

export async function scan(options: ScanOptions): Promise<ScanOutcome> {
  const hits: Hit[] = []
  const seen = new Set<string>()
  const baseGap = options.gapMs ?? REQUEST_GAP_MS
  let gap = baseGap
  let checked = 0
  let failed = 0
  let rateLimits = 0
  let failStreak = 0
  let halt: ScanOutcome['status'] | null = null
  const returned: Candidate[] = []
  let pauseWait: Promise<void> | null = null
  let nextSlot = 0

  const takeSlot = async () => {
    const now = Date.now()
    const at = Math.max(now, nextSlot)
    nextSlot = at + gap
    const wait = at - now
    if (wait > 0) await sleep(wait, options.signal)
  }

  const report = () => {
    options.onProgress?.({ checked, failed, found: hits.length, total: options.cursor.total, rateLimits })
  }

  const pull = (): Candidate | null => {
    if (returned.length) return returned.pop() ?? null
    return options.cursor.next()
  }

  const consider = (local: string, brand: Brand) => {
    const key = `${brand}:${local}`
    if (seen.has(key)) return
    if (!/^01\d{9}$/.test(local)) return
    if (!options.masks.some((mask) => matchesMask(mask, local))) return
    seen.add(key)
    const hit = { local, intl: toIntl(local), brand }
    hits.push(hit)
    options.onHit?.(hit)
  }

  const hold = async () => {
    if (failStreak < FAIL_LIMIT) return
    if (!options.waitForResume) {
      halt = 'paused'
      options.onPause?.()
      report()
      return
    }
    if (!pauseWait) {
      options.onPause?.()
      report()
      pauseWait = options
        .waitForResume(options.signal)
        .then(() => {
          failStreak = 0
        })
        .finally(() => {
          pauseWait = null
        })
    }
    await pauseWait
  }

  const worker = async () => {
    for (;;) {
      if (halt || options.signal.aborted) {
        halt = halt ?? 'stopped'
        return
      }
      const candidate = pull()
      if (!candidate) return
      const seenKey = `${candidate.brand}:${candidate.local}`
      const cached = options.lookup?.(candidate.local, candidate.brand) ?? 'miss'
      if (seen.has(seenKey) || cached === 'taken') {
        checked += 1
        report()
        continue
      }
      if (cached === 'open') {
        checked += 1
        consider(candidate.local, candidate.brand)
        report()
        continue
      }
      try {
        await takeSlot()
      } catch {
        returned.push(candidate)
        halt = halt ?? 'stopped'
        return
      }
      if (options.signal.aborted || halt) {
        returned.push(candidate)
        halt = halt ?? 'stopped'
        return
      }
      try {
        const result = await options.check(toIntl(candidate.local), candidate.brand, options.signal)
        failStreak = 0
        gap = Math.max(baseGap, gap * 0.9)
        checked += 1
        options.remember?.(candidate.local, candidate.brand, result.available)
        if (result.available) consider(candidate.local, candidate.brand)
        for (const raw of result.free) {
          const extra = toLocal(raw)
          if (!extra) continue
          if (options.masks.some((mask) => matchesMask(mask, extra))) {
            const owner = extra.startsWith('016') ? 'AIRTEL' : extra.startsWith('018') ? 'ROBI' : candidate.brand
            options.remember?.(extra, owner, true)
            consider(extra, owner)
          }
        }
      } catch (error) {
        if (options.signal.aborted) {
          returned.push(candidate)
          halt = halt ?? 'stopped'
          return
        }
        returned.push(candidate)
        failed += 1
        failStreak += 1
        if (error instanceof Error && error.name === 'RateLimitError') {
          rateLimits += 1
          gap = Math.min(12_000, Math.max(gap * 2, 4_000))
          options.onRateLimit?.()
        } else {
          gap = Math.min(8_000, Math.max(gap * 1.6, baseGap))
        }
        try {
          await hold()
        } catch {
          halt = halt ?? 'stopped'
          return
        }
        if (halt || options.signal.aborted) {
          halt = halt ?? 'stopped'
          return
        }
      }
      report()
    }
  }

  const workers = Math.max(1, Math.min(options.workers ?? 2, options.cursor.total || 1))
  await Promise.all(Array.from({ length: workers }, () => worker()))
  report()
  return { hits, checked, failed, rateLimits, status: halt ?? 'done' }
}
