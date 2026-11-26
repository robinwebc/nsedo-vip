import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Availability } from '../src/api.ts'
import type { Brand } from '../src/operators.ts'
import { scan } from '../src/scan.ts'

describe('scan', () => {
  it('keeps available numbers and matching numbers from the free list', async () => {
    const calls: string[] = []
    const check = async (intl: string): Promise<Availability> => {
      calls.push(intl)
      if (intl.endsWith('005555')) {
        return { available: false, free: ['8801815995555', '8801711111111', '8801815111555'] }
      }
      return { available: true, free: [] }
    }
    const outcome = await scan({
      queue: ['01815005555', '01815015555'],
      masks: ['01815XX5555'],
      brand: 'ROBI',
      prefix: '018',
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

  it('stops after repeated check failures', async () => {
    const check = async (): Promise<Availability> => {
      throw new Error('down')
    }
    const outcome = await scan({
      queue: ['01815005555', '01815015555', '01815025555', '01815035555', '01815045555', '01815055555'],
      masks: ['01815XX5555'],
      brand: 'ROBI' as Brand,
      prefix: '018',
      signal: new AbortController().signal,
      gapMs: 0,
      workers: 1,
      check,
    })
    assert.equal(outcome.status, 'error')
    assert.equal(outcome.failed, 5)
    assert.equal(outcome.hits.length, 0)
  })

  it('stops cleanly when the search is cancelled', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const outcome = await scan({
      queue: ['01815005555'],
      masks: ['01815XX5555'],
      brand: 'ROBI',
      prefix: '018',
      signal: ctrl.signal,
      gapMs: 0,
      workers: 1,
      check: async () => ({ available: true, free: [] }),
    })
    assert.equal(outcome.status, 'stopped')
    assert.equal(outcome.hits.length, 0)
  })
})
