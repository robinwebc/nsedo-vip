import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildPlan, matchesMask, materialize, placeMotif, sampleIndexes, sequence, toIntl, toLocal, type SearchInput } from '../src/pattern.ts'

function input(over: Partial<SearchInput> = {}): SearchInput {
  return {
    prefix: '018',
    blocks: ['01815'],
    kind: 'repeat',
    position: 'end',
    repeatDigit: 5,
    repeatLen: 4,
    seqStart: 1,
    seqLen: 4,
    seqDir: 'up',
    pairA: 1,
    pairB: 2,
    ending: '5555',
    customMask: '01815XX5555',
    cap: 80,
    ...over,
  }
}

describe('patterns', () => {
  it('places a repeated ending inside the block', () => {
    const plan = buildPlan(input())
    assert.equal(plan.ok, true)
    if (!plan.ok) return
    assert.equal(plan.masks[0].mask, '01815XX5555')
    assert.equal(plan.total, 100)
    assert.equal(plan.sampled, false)
    assert.equal(plan.queue.length, 100)
    assert.ok(plan.queue.every((local) => matchesMask('01815XX5555', local)))
    assert.equal(plan.queue[0], '01815005555')
    assert.equal(plan.queue.at(-1), '01815995555')
  })

  it('puts the motif at the start or the middle', () => {
    assert.equal(placeMotif('01815', '5555', 'start'), '018155555XX')
    assert.equal(placeMotif('01815', '5555', 'middle'), '01815X5555X')
    assert.equal(placeMotif('0181', '5555', 'middle'), '0181X5555XX')
  })

  it('builds sequences and rejects ones that fall off 0-9', () => {
    assert.equal(sequence(1, 4, 'up'), '1234')
    assert.equal(sequence(9, 4, 'down'), '9876')
    assert.equal(sequence(8, 4, 'up'), null)
    const bad = buildPlan(input({ kind: 'sequence', seqStart: 8, seqLen: 4, seqDir: 'up' }))
    assert.deepEqual(bad, { ok: false, error: 'seq' })
  })

  it('builds mirror and ABAB motifs', () => {
    const mirror = buildPlan(input({ kind: 'mirror', pairA: 1, pairB: 2 }))
    assert.equal(mirror.ok, true)
    if (!mirror.ok) return
    assert.equal(mirror.motif, '1221')
    assert.ok(mirror.queue.every((local) => local.endsWith('1221')))

    const pair = buildPlan(input({ kind: 'abab', pairA: 3, pairB: 4, position: 'start' }))
    assert.equal(pair.ok, true)
    if (!pair.ok) return
    assert.equal(pair.masks[0].mask, '018153434XX')
  })

  it('locks an exact ending to the end of the number', () => {
    const plan = buildPlan(input({ kind: 'ending', ending: '2026', position: 'start' }))
    assert.equal(plan.ok, true)
    if (!plan.ok) return
    assert.equal(plan.masks[0].mask, '01815XX2026')
  })

  it('rejects a block that does not match the operator', () => {
    const plan = buildPlan(input({ blocks: ['01615'] }))
    assert.deepEqual(plan, { ok: false, error: 'block' })
  })

  it('rejects a motif that does not fit', () => {
    const plan = buildPlan(input({ blocks: ['01815999'], repeatLen: 4 }))
    assert.deepEqual(plan, { ok: false, error: 'fit' })
  })

  it('samples a wide block instead of enumerating it', () => {
    const plan = buildPlan(input({ blocks: ['018'], cap: 40 }))
    assert.equal(plan.ok, true)
    if (!plan.ok) return
    assert.equal(plan.masks[0].mask, '018XXXX5555')
    assert.equal(plan.total, 10_000)
    assert.equal(plan.sampled, true)
    assert.equal(plan.queue.length, 40)
    assert.ok(plan.queue.every((local) => /^018\d{4}5555$/.test(local)))
    assert.equal(new Set(plan.queue).size, 40)
  })

  it('splits a capped scan across several blocks', () => {
    const plan = buildPlan(input({ blocks: ['01810', '01811'], cap: 80 }))
    assert.equal(plan.ok, true)
    if (!plan.ok) return
    assert.equal(plan.queue.length, 80)
    assert.equal(plan.queue.filter((local) => local.startsWith('01810')).length, 40)
    assert.equal(plan.queue.filter((local) => local.startsWith('01811')).length, 40)
  })

  it('accepts a custom mask and round-trips numbering', () => {
    const plan = buildPlan(input({ kind: 'custom', customMask: '0181x-xx5555' }))
    assert.equal(plan.ok, true)
    if (!plan.ok) return
    assert.equal(plan.masks[0].mask, '0181XXX5555')
    assert.equal(toLocal(toIntl('01815995555')), '01815995555')
    assert.equal(materialize('0181XXX5555', 0), '01810005555')
  })

  it('keeps sample indexes inside the space', () => {
    const indexes = sampleIndexes(10, 3)
    assert.equal(new Set(indexes).size, indexes.length)
    assert.ok(indexes.every((index) => index >= 0 && index < 10))
    assert.deepEqual(sampleIndexes(5, 5), [0, 1, 2, 3, 4])
  })
})
