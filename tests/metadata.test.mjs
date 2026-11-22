import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeVideoMetadata } from '../src/utils/metadata.ts'

describe('video metadata normalization', () => {
  it('keeps only supported fields and normalizes formats', () => {
    const result = normalizeVideoMetadata({
      id: 'abc123', title: 'Sample video', uploader: 'Creator', channel: 'Channel', duration: 5400,
      thumbnail: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
      webpage_url: 'https://www.youtube.com/watch?v=abc123', availability: 'public',
      formats: [{ format_id: '137', ext: 'mp4', height: 1080, width: 1920, vcodec: 'avc1', acodec: 'none', filesize_approx: 5000000 },
        { format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2' }],
      description: 'must not be retained',
    })
    assert.equal(result.title, 'Sample video')
    assert.equal(result.duration, 5400)
    assert.equal(result.formats[0].resolution, '1080p')
    assert.equal(result.formats[0].audioCodec, null)
    assert.equal(result.formats[0].approximateSizeBytes, 5000000)
    assert.equal(result.formats[1].resolution, 'Audio only')
    assert.equal('description' in result, false)
  })

  it('uses null or empty values for missing or invalid metadata', () => {
    assert.deepEqual(normalizeVideoMetadata({ duration: -1, thumbnail: 'http://example.com/a.jpg', formats: null }), {
      id: null, title: null, uploader: null, channel: null, duration: null, thumbnail: null,
      webpageUrl: null, availability: null, formats: [],
    })
  })
})
