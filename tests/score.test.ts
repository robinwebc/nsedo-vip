import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { vipScore } from '../src/score.ts'

describe('vip score', () => {
  it('ranks a repeated ending above a mixed number', () => {
    const vip = vipScore('01810000555')
    const plain = vipScore('01819483726')
    assert.ok(vip.score > plain.score)
    assert.ok(vip.tags.some((tag) => tag.startsWith('run')))
    assert.ok(vip.score >= 1 && vip.score <= 99)
    assert.ok(plain.score >= 1 && plain.score <= 99)
  })

  it('notices sequences, pairs, and mirrors', () => {
    assert.ok(vipScore('01811234123').tags.some((tag) => tag.startsWith('seq')))
    assert.ok(vipScore('01815121212').tags.some((tag) => tag.startsWith('abab')))
    assert.ok(vipScore('01815122122').tags.some((tag) => tag.startsWith('mirror')))
  })

  it('gives an ending run at least as much as the same run earlier', () => {
    const ending = vipScore('01810000555')
    const earlier = vipScore('01815550001')
    assert.ok(ending.score >= earlier.score)
  })
})
