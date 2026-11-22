import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { queryVideo } from '../electron/services/youtube.service.ts'

const executable = process.env.YTDLP_PATH

describe('YouTube metadata integration (network required)', { skip: !executable && 'Set YTDLP_PATH to the local yt-dlp executable.' }, () => {
  it('reads metadata and available formats from a public video without downloading it', async () => {
    const result = await queryVideo(executable, 'https://www.youtube.com/watch?v=9bZkp7q19f0')
    assert.equal(result.ok, true, result.ok ? '' : result.error.message)
    if (!result.ok) return
    assert.ok(result.data.title)
    assert.equal(result.data.duration, 252)
    assert.ok(result.data.formats.length > 0)
    assert.match(result.version, /^\d{4}\.\d{2}\.\d{2}/)
  })

  it('returns a user-safe failure for a nonexistent video ID', async () => {
    const result = await queryVideo(executable, 'https://www.youtube.com/watch?v=AAAAAAAAAAA')
    assert.equal(result.ok, false)
    if (!result.ok) assert.ok(['VIDEO_UNAVAILABLE', 'NETWORK', 'PROCESS'].includes(result.error.code))
  })
})
