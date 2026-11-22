import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isYouTubeUrl } from '../src/utils/youtube.ts'

describe('YouTube URL validation', () => {
  it('accepts watch, live and short links', () => {
    assert.equal(isYouTubeUrl('https://www.youtube.com/watch?v=abc123'), true)
    assert.equal(isYouTubeUrl('https://youtube.com/live/abc123'), true)
    assert.equal(isYouTubeUrl('https://youtu.be/abc123'), true)
  })
  it('trims whitespace and rejects unrelated or incomplete URLs', () => {
    assert.equal(isYouTubeUrl('  https://youtu.be/abc123  '), true)
    assert.equal(isYouTubeUrl('https://example.com/watch?v=abc123'), false)
    assert.equal(isYouTubeUrl('https://youtube.com/watch'), false)
    assert.equal(isYouTubeUrl('not a url'), false)
    assert.equal(isYouTubeUrl('http://youtube.com/watch?v=abc123'), false)
    assert.equal(isYouTubeUrl('https://youtube.com.evil.example/watch?v=abc123'), false)
    assert.equal(isYouTubeUrl('https://youtube.com@evil.example/watch?v=abc123'), false)
    assert.equal(isYouTubeUrl('https://youtu.be/abc123/extra'), false)
  })
})
