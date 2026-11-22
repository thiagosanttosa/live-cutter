import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { collectSystemStatus } from '../electron/services/system-status.service.ts'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

test('system status executes compatible tools and checks output write access', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'live-cutter-status-'))
  try {
    const bins = path.join(temp, 'resources')
    await mkdir(bins)
    const executables = ['yt-dlp.exe', 'ffmpeg.exe', 'ffprobe.exe']
    for (const file of executables) await writeFile(path.join(bins, file), 'test executable placeholder')
    const calls = []
    const run = async (executable, args) => {
      calls.push({ executable, args })
      if (args.includes('--version')) return { stdout: '2026.10.26\n', stderr: '', exitCode: 0 }
      if (args[0] === '-version') {
        const name = path.basename(executable).replace('.exe', '')
        return { stdout: `${name} version 9.0.2\n`, stderr: '', exitCode: 0 }
      }
      return { stdout: ' V..... h264_mf\n A..... aac\n', stderr: '', exitCode: 0 }
    }
    const outputDirectory = path.join(temp, 'Videos', 'LIVE CUTTER')
    const status = await collectSystemStatus({
      appVersion: '0.1.0',
      ytDlp: path.join(bins, executables[0]),
      ffmpeg: path.join(bins, executables[1]),
      ffprobe: path.join(bins, executables[2]),
      outputDirectory,
    }, run)

    assert.equal(status.app.available, true)
    assert.equal(status.ytDlp.version, '2026.10.26')
    assert.equal(status.ffmpeg.version, '9.0.2')
    assert.equal(status.ffprobe.available, true)
    assert.equal(status.outputFolder.available, true)
    assert.equal(calls.length, 4)
  } finally { await rm(temp, { recursive: true, force: true }) }
})

test('system status reports missing and incompatible dependencies without a positive status', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'live-cutter-status-'))
  try {
    const oldYtDlp = path.join(temp, 'yt-dlp.exe')
    const oldFfmpeg = path.join(temp, 'ffmpeg.exe')
    const oldFfprobe = path.join(temp, 'ffprobe.exe')
    for (const file of [oldYtDlp, oldFfmpeg, oldFfprobe]) await writeFile(file, 'test executable placeholder')
    const run = async (_executable, args) => args.includes('--version')
      ? { stdout: '2020.01.01\n', stderr: '', exitCode: 0 }
      : { stdout: 'ffmpeg version 5.0\n', stderr: '', exitCode: 0 }
    const status = await collectSystemStatus({
      appVersion: '0.1.0', ytDlp: oldYtDlp, ffmpeg: oldFfmpeg, ffprobe: oldFfprobe,
      outputDirectory: path.join(temp, 'out'),
    }, run)
    assert.equal(status.app.available, false)
    assert.equal(status.ytDlp.available, false)
    assert.match(status.ytDlp.message, /2024\.08\.06/)
    assert.equal(status.ffmpeg.available, false)
    assert.equal(status.ffprobe.available, false)

    const missing = await collectSystemStatus({
      appVersion: '0.1.0', ytDlp: null, ffmpeg: null, ffprobe: null,
      outputDirectory: path.join(temp, 'out'),
    }, run)
    assert.equal(missing.ytDlp.available, false)
    assert.match(missing.ffmpeg.message, /missing/)
  } finally { await rm(temp, { recursive: true, force: true }) }
})
