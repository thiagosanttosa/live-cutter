import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildDownloadArgs } from '../electron/services/download.service.ts'

const video = { duration: 3600 }

describe('partial download command', () => {
  it('uses a fixed yt-dlp argument list and only the requested interval', () => {
    const args = buildDownloadArgs({
      request: { url: 'https://www.youtube.com/watch?v=abcdef12345', start: '00:30:00', end: '00:32:00' },
      video,
      ffmpegLocation: 'D:\\media tools\\ffmpeg',
      outputTemplate: 'C:\\Users\\Public\\Videos\\LIVE CUTTER\\job\\source.%(ext)s',
    })
    assert.ok(args.includes('--download-sections'))
    assert.equal(args[args.indexOf('--download-sections') + 1], '*00:30:00-00:32:00')
    assert.equal(args[args.indexOf('--format') + 1], 'bv*+ba/b')
    assert.ok(args.includes('--force-keyframes-at-cuts'))
    assert.equal(args.at(-1), 'https://www.youtube.com/watch?v=abcdef12345')
    assert.ok(args.includes('--'))
    assert.ok(!args.includes('shell'))
  })

  it('prefers H.264/AAC MP4 sources when compatibility quality is selected', () => {
    const args = buildDownloadArgs({
      request: { url: 'https://youtu.be/abcdef12345', start: '00:00:00', end: '00:00:30' },
      video,
      outputTemplate: 'source.%(ext)s',
      quality: 'compatibility',
    })
    assert.equal(args[args.indexOf('--format') + 1], 'bv*[vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/b[ext=mp4][vcodec^=avc1][acodec^=mp4a]/bv*+ba/b')
  })

  it('rejects invalid URLs and invalid clip intervals before process creation', () => {
    assert.throws(() => buildDownloadArgs({
      request: { url: 'https://example.com/watch?v=abcdef', start: '00:00:00', end: '00:00:30' },
      video,
      outputTemplate: 'source.%(ext)s',
    }), /YouTube/)
    assert.throws(() => buildDownloadArgs({
      request: { url: 'https://youtu.be/abcdef12345', start: '00:30:00', end: '00:32:00' },
      video: { duration: 100 },
      outputTemplate: 'source.%(ext)s',
    }), /exceeds/)
  })
})
