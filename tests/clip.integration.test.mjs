import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ClipService } from '../electron/services/clip.service.ts'
import { HistoryService } from '../electron/services/history.service.ts'
import { SettingsService } from '../electron/services/settings.service.ts'
import { queryVideo } from '../electron/services/youtube.service.ts'
import { formatTime } from '../src/utils/time.ts'

const url = process.env.CLIP_INTEGRATION_URL
const ytDlp = process.env.YTDLP_PATH
const ffmpeg = process.env.FFMPEG_PATH ?? path.resolve('vendor/ffmpeg/ffmpeg.exe')
const ffprobe = process.env.FFPROBE_PATH ?? path.resolve('vendor/ffmpeg/ffprobe.exe')

async function createHarness() {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'live-cutter-clip-integration-'))
  const settings = new SettingsService(path.join(temp, 'user-data'), path.join(temp, 'output', 'LIVE CUTTER'))
  await settings.updateFileNamingPattern('{title}_{start}_{end}_{date}')
  const history = new HistoryService(path.join(temp, 'user-data'))
  return {
    temp,
    history,
    service: new ClipService({
      ytDlp,
      ffmpeg,
      ffprobe,
      ffmpegDirectory: path.dirname(ffmpeg),
      videosDirectory: path.join(temp, 'output'),
      temporaryDirectory: temp,
      loadSettings: () => settings.get(),
      recordHistory: (entry) => history.add(entry),
    }),
  }
}

async function assertNoJobDirectories(temp) {
  const jobRoot = path.join(temp, 'live-cutter')
  const entries = await readdir(jobRoot).catch((error) => {
    if (error?.code === 'ENOENT') return []
    throw error
  })
  assert.deepEqual(entries, [], 'Temporary job directory must be removed after a terminal result.')
}

function seconds(timestamp) {
  return timestamp.split(':').map(Number).reduce((total, part) => total * 60 + part, 0)
}

describe('authorized YouTube clip integration (explicit opt-in)', { skip: !url || !ytDlp }, () => {
  it('downloads short, medium, late and near-end intervals and validates each MP4', async () => {
    const lookup = await queryVideo(ytDlp, url)
    assert.equal(lookup.ok, true, lookup.ok ? '' : lookup.error.message)
    if (!lookup.ok || lookup.data.duration === null) throw new Error('The integration video must have a known duration.')

    const duration = Math.floor(lookup.data.duration)
    assert.ok(duration >= 240, 'Choose an authorized public video at least four minutes long.')
    const ranges = [
      ['00:00:00', '00:00:30'],
      ['00:02:00', '00:04:00'],
      [formatTime(Math.floor(duration * 0.75)), formatTime(Math.floor(duration * 0.75) + 30)],
      [formatTime(duration - 40), formatTime(duration - 10)],
    ]
    const { temp, service, history: serviceHistory } = await createHarness()
    try {
      for (const [start, end] of ranges) {
        const startedAt = performance.now()
        const terminalEvent = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Clip integration timed out.')), 10 * 60 * 1000)
          const started = service.start({ url, start, end }, (event) => {
            if (!event.terminal) return
            clearTimeout(timeout)
            resolve(event)
          })
          if (!started.ok) {
            clearTimeout(timeout)
            reject(new Error(started.message))
          }
        })
        const event = await terminalEvent
        assert.equal(event.terminal.ok, true, event.terminal.ok ? '' : event.terminal.message)
        assert.ok(event.terminal.output.fileSizeBytes > 0)
        assert.equal(path.extname(event.terminal.output.fileName).toLowerCase(), '.mp4')
        assert.equal(event.terminal.output.videoCodec, 'h264')
        assert.equal(event.terminal.output.audioCodec, 'aac')
        assert.ok(event.terminal.output.width > 0 && event.terminal.output.height > 0)
        const requestedDuration = seconds(end) - seconds(start)
        const tolerance = Math.max(1.5, Math.min(3, requestedDuration * 0.02))
        assert.ok(Math.abs(event.terminal.output.durationSeconds - requestedDuration) <= tolerance)
        assert.match(event.terminal.output.fileName, /_\d{4}-\d{2}-\d{2}\.mp4$/)
        const historyEntry = await serviceHistory.get(event.terminal.output.jobId)
        assert.equal(historyEntry?.status, 'completed')
        assert.equal(historyEntry?.fileName, event.terminal.output.fileName)
        await assertNoJobDirectories(temp)
        console.log(`Verified ${start}-${end}: ${event.terminal.output.fileSizeBytes} output bytes, ${event.terminal.output.width}x${event.terminal.output.height}, ${(performance.now() - startedAt) / 1000}s`)
      }
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  }, { timeout: 45 * 60 * 1000 })

  it('cancels a real download after entering the downloading stage', async () => {
    const { temp, service, history: serviceHistory } = await createHarness()
    try {
      let jobId = ''
      let cancelTimer = null
      let cancelRequested = false
      let lastPercent = null
      const terminalEvent = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Cancellation integration timed out.')), 10 * 60 * 1000)
        const started = service.start({ url, start: '00:04:00', end: '00:06:00' }, (event) => {
          if (event.percent !== null) lastPercent = event.percent
          if (event.jobId === jobId && event.stage === 'downloading' && !cancelTimer && !cancelRequested) {
            cancelTimer = setTimeout(() => { cancelRequested = service.cancel(jobId) }, 1_500)
          }
          if (event.terminal) {
            clearTimeout(timeout)
            if (cancelTimer) clearTimeout(cancelTimer)
            resolve(event)
          }
        })
        if (!started.ok) {
          clearTimeout(timeout)
          reject(new Error(started.message))
          return
        }
        jobId = started.jobId
      })
      const event = await terminalEvent
      assert.equal(cancelRequested, true, 'Cancellation must target the active operation.')
      assert.equal(event.terminal.ok, false)
      if (!event.terminal.ok) assert.equal(event.terminal.cancelled, true)
      const historyEntry = await serviceHistory.get(jobId)
      assert.equal(historyEntry?.status, 'cancelled')
      assert.equal(historyEntry?.fileName, null)
      await assertNoJobDirectories(temp)
      console.log(`Verified real download cancellation${lastPercent === null ? ' without a reported percentage' : ` at ${lastPercent}%`}; temporary job files were cleaned.`)
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  }, { timeout: 15 * 60 * 1000 })
})
