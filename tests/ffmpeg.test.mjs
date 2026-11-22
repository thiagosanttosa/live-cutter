import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { validateProbeResult, getMediaTools, probeMedia, makeCompatibleMp4 } from '../electron/services/ffmpeg.service.ts'
import { runChildProcess } from '../electron/services/process.service.ts'

const validProbe = {
  streams: [
    { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080 },
    { codec_type: 'audio', codec_name: 'aac' },
  ],
  format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '30.04', tags: { major_brand: 'isom' } },
}

describe('FFprobe result validation', () => {
  it('accepts an MP4 with audio/video and duration within tolerance', () => {
    assert.deepEqual(validateProbeResult(validProbe, 30), {
      durationSeconds: 30.04, width: 1920, height: 1080, videoCodec: 'h264', audioCodec: 'aac', isMp4: true,
    })
  })
  it('rejects missing audio, video, incompatible container or incorrect duration', () => {
    assert.throws(() => validateProbeResult({ ...validProbe, streams: validProbe.streams.slice(0, 1) }, 30), /audio stream/)
    assert.throws(() => validateProbeResult({ ...validProbe, format: { format_name: 'matroska', duration: 30 } }, 30), /MP4/)
    assert.throws(() => validateProbeResult({ ...validProbe, format: { ...validProbe.format, duration: 45 } }, 30), /requested interval/)
    assert.throws(() => validateProbeResult({ ...validProbe, streams: [{ codec_type: 'audio', codec_name: 'aac' }] }, 30), /video stream/)
    assert.throws(() => validateProbeResult({ streams: [] }, 30), /video stream/)
  })

  it('allows a non-MP4 source only before conversion', () => {
    const source = { ...validProbe, format: { format_name: 'matroska,webm', duration: '30' } }
    assert.equal(validateProbeResult(source, 30, false).isMp4, false)
    assert.throws(() => validateProbeResult(source, 30), /MP4/)
  })

  it('remuxes a QuickTime MOV as MP4 even when its streams already use H.264/AAC', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'live-cutter-mov-test-'))
    const ffmpeg = path.resolve('vendor/ffmpeg/ffmpeg.exe')
    const ffprobe = path.resolve('vendor/ffmpeg/ffprobe.exe')
    const sourcePath = path.join(directory, 'source.mov')
    const outputPath = path.join(directory, 'output.mp4')
    const tools = await getMediaTools(ffmpeg, ffprobe, path.dirname(ffmpeg))
    try {
      await runChildProcess(ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=25:d=2',
        '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=2',
        '-c:v', 'h264_mf', '-c:a', 'aac', '-f', 'mov', sourcePath,
      ], { timeoutMs: 60_000 })
      const sourceProbe = await probeMedia(tools, sourcePath)
      const source = validateProbeResult(sourceProbe, 2, false)
      assert.equal(sourceProbe.format?.tags?.major_brand, 'qt  ')
      assert.equal(source.isMp4, false)
      const resultPath = await makeCompatibleMp4(tools, sourcePath, outputPath, source, () => {}, new AbortController().signal)
      assert.equal(resultPath, outputPath)
      assert.equal(validateProbeResult(await probeMedia(tools, resultPath), 2).isMp4, true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('probes a real sample and converts an incompatible source to H.264/AAC MP4', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'live-cutter-ffmpeg-test-'))
    const ffmpeg = path.resolve('vendor/ffmpeg/ffmpeg.exe')
    const ffprobe = path.resolve('vendor/ffmpeg/ffprobe.exe')
    const sourcePath = path.join(directory, 'source.mkv')
    const outputPath = path.join(directory, 'output.mp4')
    const tools = await getMediaTools(ffmpeg, ffprobe, path.dirname(ffmpeg))
    const progress = []
    try {
      await runChildProcess(ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=25:d=4',
        '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=4',
        '-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'aac', '-b:a', '96k', sourcePath,
      ], { timeoutMs: 60_000 })
      const source = validateProbeResult(await probeMedia(tools, sourcePath), 4, false)
      assert.equal(source.isMp4, false)
      const resultPath = await makeCompatibleMp4(tools, sourcePath, outputPath, source, (value) => progress.push(value), new AbortController().signal)
      const final = validateProbeResult(await probeMedia(tools, resultPath), 4)
      assert.equal(final.videoCodec, 'h264')
      assert.equal(final.audioCodec, 'aac')
      assert.ok(progress.some((item) => item.stage === 'processing'))
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
