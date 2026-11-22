import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatTime, parseTime, validateRange } from '../src/utils/time.ts'

describe('time conversion and validation', () => {
  it('converts HH:MM:SS to seconds', () => {
    assert.equal(parseTime('02:15:30'), 8130)
    assert.equal(parseTime('02:18:45'), 8325)
  })
  it('formats elapsed seconds as HH:MM:SS', () => {
    assert.equal(formatTime(195), '00:03:15')
    assert.equal(formatTime(8130), '02:15:30')
  })
  it('rejects incomplete and out-of-range values', () => {
    assert.equal(parseTime('1:02:03'), null)
    assert.equal(parseTime('00:60:00'), null)
    assert.equal(parseTime('00:00:60'), null)
  })
  it('requires the end time to follow the start time', () => {
    assert.equal(validateRange('00:01:00', '00:01:00'), 'End time must be later than start time.')
    assert.equal(validateRange('00:01:00', '00:02:00'), null)
  })
  it('enforces a known video duration and leaves unknown duration unbounded', () => {
    assert.equal(validateRange('08:45:00', '09:35:00', 9 * 60 * 60 + 30 * 60), 'End time exceeds the video duration.')
    assert.equal(validateRange('08:45:00', '09:35:00'), null)
  })
})
