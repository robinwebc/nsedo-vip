import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { matchesMask, materialize, placeMotif, sequence, toIntl, toLocal } from '../src/pattern.ts'

describe('pattern helpers', () => {
  it('places a motif at the start, middle, or end', () => {
    assert.equal(placeMotif('01815', '5555', 'end'), '01815XX5555')
    assert.equal(placeMotif('01815', '5555', 'start'), '018155555XX')
    assert.equal(placeMotif('01815', '5555', 'middle'), '01815X5555X')
    assert.equal(placeMotif('0181', '5555', 'middle'), '0181X5555XX')
  })

  it('builds sequences inside 0-9', () => {
    assert.equal(sequence(1, 4, 'up'), '1234')
    assert.equal(sequence(9, 4, 'down'), '9876')
    assert.equal(sequence(8, 4, 'up'), null)
  })

  it('materializes wildcards from the right and round-trips numbers', () => {
    assert.equal(materialize('0181XXX5555', 0), '01810005555')
    assert.equal(materialize('01815XX5555', 99), '01815995555')
    assert.equal(matchesMask('01815XX5555', '01815995555'), true)
    assert.equal(matchesMask('01815XX5555', '01815995556'), false)
    assert.equal(toLocal(toIntl('01815995555')), '01815995555')
  })
})
