import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { loadChecked, note, saveChecked, verdict } from '../src/cache.ts'

function memory() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

describe('session cache', () => {
  it('remembers a taken number and forgets it after the window', () => {
    const now = Date.now()
    const store = memory()
    const map = loadChecked(store)
    note(map, 'ROBI', '01815005555', false, now)
    saveChecked(store, map)
    const loaded = loadChecked(store)
    assert.equal(verdict(loaded, 'ROBI', '01815005555', now + 1000), 'taken')
    assert.equal(verdict(loaded, 'ROBI', '01815005555', now + 13 * 60 * 60 * 1000), 'miss')
  })

  it('treats a recently open number as open', () => {
    const map = loadChecked(memory())
    note(map, 'AIRTEL', '01615005555', true, 5_000)
    assert.equal(verdict(map, 'AIRTEL', '01615005555', 5_000 + 60_000), 'open')
    assert.equal(verdict(map, 'AIRTEL', '01615005555', 5_000 + 31 * 60 * 1000), 'miss')
  })
})
