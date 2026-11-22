import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import os from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { ClipService } from '../electron/services/clip.service.ts'
import { createDefaultSettings } from '../electron/services/settings.service.ts'

async function runMissingToolCase(overrides, expectedMessage) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'live-cutter-missing-tool-'))
  const history = []
  try {
    const outputDirectory = path.join(root, 'videos', 'LIVE CUTTER')
    const service = new ClipService({
      ytDlp: null,
      ffmpeg: null,
      ffprobe: null,
      ffmpegDirectory: null,
      videosDirectory: path.join(root, 'videos'),
      temporaryDirectory: path.join(root, 'temp'),
      loadSettings: async () => createDefaultSettings(outputDirectory),
      recordHistory: async (entry) => history.push(entry),
      ...overrides,
    })
    const terminal = new Promise((resolve) => {
      const started = service.start({
        url: 'https://youtu.be/abcdef',
        start: '00:00:00',
        end: '00:00:30',
      }, (event) => { if (event.terminal) resolve(event) })
      assert.equal(started.ok, true)
    })
    const event = await terminal
    assert.equal(event.terminal.ok, false)
    assert.match(event.terminal.message, expectedMessage)
    assert.equal(history.length, 1)
    assert.equal(history[0].status, 'error')
    assert.equal(history[0].fileName, null)
    assert.equal(service.isBusy, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('clip failures for missing yt-dlp and missing FFmpeg/FFprobe are recorded without producing output', async () => {
  await runMissingToolCase({}, /yt-dlp is missing/i)
  await runMissingToolCase({ ytDlp: 'present-but-not-used' }, /FFmpeg and FFprobe are required/i)
})

test('invalid clip URLs are rejected before a job starts', () => {
  const service = new ClipService({
    ytDlp: null,
    ffmpeg: null,
    ffprobe: null,
    ffmpegDirectory: null,
    videosDirectory: os.tmpdir(),
    temporaryDirectory: os.tmpdir(),
  })
  const result = service.start({ url: 'https://example.com/video', start: '00:00:00', end: '00:00:30' }, () => {})
  assert.equal(result.ok, false)
  assert.match(result.message, /YouTube.*URL/)
  assert.equal(service.isBusy, false)
})
