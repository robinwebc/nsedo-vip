import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createCursor, expandMask, parseQuery, planSameEnding, type QueryOptions } from '../src/query.ts'

const both: QueryOptions = { operators: 'all', position: 'end', block: '' }

describe('query parsing', () => {
  it('treats 5555 as an ending on both operators, with no cap', () => {
    const plan = parseQuery('5555', both)
    assert.equal(plan.ok, true)
    if (!plan.ok) return
    assert.deepEqual(
      plan.jobs.map((job) => job.mask),
      ['018XXXX5555', '016XXXX5555'],
    )
    assert.equal(plan.total, 20_000)
    assert.ok(plan.total > 320)
  })

  it('expands a short mask such as 018XX5555 to 11 places', () => {
    assert.equal(expandMask('018XX5555'), '018XXXX5555')
    const plan = parseQuery('018xx-5555', both)
    assert.equal(plan.ok, true)
    if (!plan.ok) return
    assert.equal(plan.jobs.length, 1)
    assert.equal(plan.jobs[0].brand, 'ROBI')
    assert.equal(plan.jobs[0].mask, '018XXXX5555')
    assert.equal(plan.jobs[0].total, 10_000)
  })

  it('treats a block typed on its own as that whole block', () => {
    const plan = parseQuery('01815', both)
    assert.equal(plan.ok, true)
    if (!plan.ok) return
    assert.equal(plan.jobs[0].mask, '01815XXXXXX')
    assert.equal(plan.total, 1_000_000)
  })

  it('treats an 8-digit birthday as an exact ending on both operators', () => {
    const plan = parseQuery('01011990', both)
    assert.equal(plan.ok, true)
    if (!plan.ok) return
    assert.deepEqual(
      plan.jobs.map((job) => job.mask),
      ['01801011990', '01601011990'],
    )
    assert.equal(plan.total, 2)
  })

  it('honours a tighter block and a single operator', () => {
    const plan = parseQuery('5555', { operators: 'robi', position: 'end', block: '01815' })
    assert.equal(plan.ok, true)
    if (!plan.ok) return
    assert.deepEqual(
      plan.jobs.map((job) => job.mask),
      ['01815XX5555'],
    )
  })

  it('builds last-4-same across every digit and both operators', () => {
    const plan = planSameEnding(4, both)
    assert.equal(plan.ok, true)
    if (!plan.ok) return
    assert.equal(plan.jobs.length, 20)
    assert.equal(plan.total, 200_000)
    assert.ok(plan.jobs.some((job) => job.mask.endsWith('0000') && job.brand === 'AIRTEL'))
  })

  it('walks past the old 320 cap and alternates operators', () => {
    const plan = parseQuery('55', both)
    assert.equal(plan.ok, true)
    if (!plan.ok) return
    const cursor = createCursor(plan.jobs)
    const first: string[] = []
    for (let i = 0; i < 400; i++) first.push(cursor.next()?.local ?? '')
    assert.equal(first.length, 400)
    assert.ok(first.every((local) => local.endsWith('55')))
    assert.ok(first.some((local) => local.startsWith('018')))
    assert.ok(first.some((local) => local.startsWith('016')))
    assert.equal(new Set(first).size, 400)
  })
})
