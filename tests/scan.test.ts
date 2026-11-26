import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Availability } from '../src/api.ts'
import type { Brand } from '../src/operators.ts'
import type { Candidate, CandidateCursor } from '../src/query.ts'
import { scan } from '../src/scan.ts'

function listCursor(locals: { local: string; brand: Brand }[], mask: string): CandidateCursor {
  let index = 0
  return {
    total: locals.length,
    next(): Candidate | null {
      const item = locals[index]
      if (!item) return null
      index += 1
      return { ...item, prefix: item.local.slice(0, 3), mask }
    },
  }
}

describe('scan', () => {
  it('keeps available numbers and matching numbers from the free list', async () => {
    const calls: string[] = []
    const check = async (intl: string): Promise<Availability> => {
      calls.push(intl)
      if (intl.endsWith('005555')) return { available: false, free: ['8801815995555', '8801711111111', '8801815111555'] }
      return { available: true, free: [] }
    }
    const outcome = await scan({
      cursor: listCursor(
        [
          { local: '01815005555', brand: 'ROBI' },
          { local: '01815015555', brand: 'ROBI' },
        ],
        '01815XX5555',
      ),
      masks: ['01815XX5555'],
      signal: new AbortController().signal,
      gapMs: 0,
      workers: 1,
      check,
    })
    assert.deepEqual(
      outcome.hits.map((hit) => hit.local),
      ['01815995555', '01815015555'],
    )
    assert.equal(outcome.status, 'done')
    assert.equal(outcome.failed, 0)
    assert.deepEqual(calls, ['8801815005555', '8801815015555'])
  })

  it('pauses after repeated failures and continues the same candidate', async () => {
    let calls = 0
    const check = async (): Promise<Availability> => {
      calls += 1
      if (calls < 6) throw new Error('down')
      return { available: true, free: [] }
    }
    let paused = 0
    const outcome = await scan({
      cursor: listCursor([{ local: '01815005555', brand: 'ROBI' }], '01815005555'),
      masks: ['01815005555'],
      signal: new AbortController().signal,
      gapMs: 0,
      workers: 1,
      check,
      onPause() {
        paused += 1
      },
      waitForResume: async () => undefined,
    })
    assert.equal(paused, 1)
    assert.equal(outcome.status, 'done')
    assert.equal(outcome.hits.length, 1)
    assert.equal(calls, 6)
  })

  it('skips numbers already cached in this session', async () => {
    const calls: string[] = []
    const outcome = await scan({
      cursor: listCursor(
        [
          { local: '01815005555', brand: 'ROBI' },
          { local: '01615005555', brand: 'AIRTEL' },
        ],
        '01X15XX5555',
      ),
      masks: ['01815XX5555', '01615XX5555'],
      signal: new AbortController().signal,
      gapMs: 0,
      workers: 1,
      check: async (intl) => {
        calls.push(intl)
        return { available: true, free: [] }
      },
      lookup: (local) => (local.startsWith('018') ? 'taken' : 'open'),
    })
    assert.deepEqual(calls, [])
    assert.deepEqual(
      outcome.hits.map((hit) => hit.local),
      ['01615005555'],
    )
    assert.equal(outcome.checked, 2)
  })

  it('checks past the old 320 cap when the cursor is longer', async () => {
    const locals = Array.from({ length: 400 }, (_, index) => ({
      local: `01815${String(index).padStart(4, '0')}55`,
      brand: 'ROBI' as const,
    }))
    let calls = 0
    const outcome = await scan({
      cursor: listCursor(locals, '01815XXXX55'),
      masks: ['01815XXXX55'],
      signal: new AbortController().signal,
      gapMs: 0,
      workers: 1,
      check: async () => {
        calls += 1
        return { available: calls % 50 === 0, free: [] }
      },
    })
    assert.equal(outcome.status, 'done')
    assert.equal(calls, 400)
    assert.ok(outcome.hits.length >= 8)
  })

  it('stops cleanly when the search is cancelled', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const outcome = await scan({
      cursor: listCursor([{ local: '01815005555', brand: 'ROBI' }], '01815005555'),
      masks: ['01815005555'],
      signal: ctrl.signal,
      gapMs: 0,
      workers: 1,
      check: async () => ({ available: true, free: [] }),
    })
    assert.equal(outcome.status, 'stopped')
    assert.equal(outcome.hits.length, 0)
  })
})
