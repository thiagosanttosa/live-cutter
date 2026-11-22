import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseYtDlpProgress, sanitizeFilePart, validateClipRequest } from '../src/utils/clip.ts'

describe('clip request helpers', () => {
  it('validates interval duration and builds yt-dlp time ranges', () => {
    assert.deepEqual(validateClipRequest({ url: 'https://youtu.be/abcdef', start: '02:15:30', end: '02:18:45' }, 40_000), {
      startSeconds: 8130, endSeconds: 8325, durationSeconds: 195, section: '*02:15:30-02:18:45',
    })
    assert.throws(() => validateClipRequest({ url: 'https://youtu.be/abcdef', start: '00:01:00', end: '00:03:00' }, 100), /exceeds/)
    assert.throws(() => validateClipRequest({ url: 'https://youtu.be/abcdef', start: '00:02:00', end: '00:01:00' }, null), /later/)
  })

  it('sanitizes Windows-invalid names and reserved device names', () => {
    assert.equal(sanitizeFilePart('GTA: VI / * LIVE?'), 'GTA_VI_LIVE')
    assert.equal(sanitizeFilePart('CON'), '_CON')
    assert.equal(sanitizeFilePart('  '), 'YouTube_clip')
    assert.ok(sanitizeFilePart('A'.repeat(150)).length <= 90)
  })

  it('parses real progress fields and leaves indeterminate values null', () => {
    assert.deepEqual(parseYtDlpProgress('LC_PROGRESS|downloading| 42.5%|4.2MiB/s|00:13'), {
      status: 'downloading', percent: 42.5, speed: '4.2MiB/s', etaSeconds: 13,
    })
    assert.deepEqual(parseYtDlpProgress('[download] LC_PROGRESS|downloading| 12.0%|1.0MiB/s|00:20'), {
      status: 'downloading', percent: 12, speed: '1.0MiB/s', etaSeconds: 20,
    })
    assert.deepEqual(parseYtDlpProgress('LC_PROGRESS|downloading|NA|NA|NA'), {
      status: 'downloading', percent: null, speed: null, etaSeconds: null,
    })
    assert.equal(parseYtDlpProgress('random yt-dlp output'), null)
  })
})
