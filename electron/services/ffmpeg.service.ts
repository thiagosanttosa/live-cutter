import type { ClipProgress } from '../../src/types/video.ts'
import path from 'node:path'
import { runChildProcess } from './process.service.ts'

export interface MediaTools {
  ffmpeg: string
  ffprobe: string
  ffmpegDirectory: string | null
  ffmpegVersion: string
  ffprobeVersion: string
  h264Encoder: 'libx264' | 'h264_mf'
}

export interface ProbeStream {
  codec_type?: unknown
  codec_name?: unknown
  width?: unknown
  height?: unknown
  duration?: unknown
}

export interface ProbeInfo {
  streams: ProbeStream[]
  format?: { format_name?: unknown; duration?: unknown; size?: unknown; tags?: Record<string, unknown> }
}

export interface ValidatedMedia {
  durationSeconds: number
  width: number
  height: number
  videoCodec: string
  audioCodec: string
  isMp4: boolean
}

export async function getMediaTools(ffmpeg: string, ffprobe: string, ffmpegDirectory: string | null): Promise<MediaTools> {
  const [ffmpegVersionResult, ffprobeVersionResult, encoders] = await Promise.all([
    runChildProcess(ffmpeg, ['-version'], { timeoutMs: 10_000 }),
    runChildProcess(ffprobe, ['-version'], { timeoutMs: 10_000 }),
    runChildProcess(ffmpeg, ['-hide_banner', '-encoders'], { timeoutMs: 20_000 }),
  ])
  const ffmpegVersion = /^ffmpeg version\s+(\S+)/m.exec(ffmpegVersionResult.stdout)?.[1] ?? null
  const ffprobeVersion = /^ffprobe version\s+(\S+)/m.exec(ffprobeVersionResult.stdout)?.[1] ?? null
  if (!ffmpegVersion || !ffprobeVersion) throw new Error('FFmpeg and FFprobe could not report their versions.')
  if (compareVersion(ffmpegVersion, '6.0') < 0 || compareVersion(ffprobeVersion, '6.0') < 0) {
    throw new Error('FFmpeg and FFprobe version 6.0 or newer are required.')
  }

  const encoderOutput = `${encoders.stdout}\n${encoders.stderr}`
  const h264Encoder = /\blibx264\b/.test(encoderOutput) ? 'libx264' : /\bh264_mf\b/.test(encoderOutput) ? 'h264_mf' : null
  if (!h264Encoder || !/\baac\b/.test(encoderOutput)) {
    throw new Error('This FFmpeg build must include an H.264 encoder (libx264 or h264_mf) and the AAC encoder.')
  }
  return { ffmpeg, ffprobe, ffmpegDirectory, ffmpegVersion, ffprobeVersion, h264Encoder }
}

function compareVersion(actual: string, minimum: string): number {
  const read = (value: string) => value.match(/\d+(?:\.\d+){1,2}/)?.[0].split('.').map(Number) ?? [0]
  const left = read(actual)
  const right = read(minimum)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return Math.sign(difference)
  }
  return 0
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function positiveNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(number) && number > 0 ? number : null
}

export function validateProbeResult(probe: ProbeInfo, requestedDuration: number, requireMp4 = true): ValidatedMedia {
  if (!Array.isArray(probe.streams)) throw new Error('FFprobe did not return a valid stream list.')
  const video = probe.streams.find((stream) => stream.codec_type === 'video')
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio')
  if (!video) throw new Error('The generated file does not contain a video stream.')
  if (!audio) throw new Error('The generated file does not contain an audio stream.')
  const width = positiveNumber(video.width)
  const height = positiveNumber(video.height)
  if (!width || !height) throw new Error('FFprobe could not determine the video resolution.')
  const videoCodec = nonEmptyString(video.codec_name)
  const audioCodec = nonEmptyString(audio.codec_name)
  if (!videoCodec || !audioCodec) throw new Error('FFprobe could not identify both media codecs.')
  const duration = positiveNumber(probe.format?.duration)
    ?? Math.max(positiveNumber(video.duration) ?? 0, positiveNumber(audio.duration) ?? 0)
  if (!duration) throw new Error('FFprobe could not determine the final file duration.')
  const allowedDifference = Math.max(1.5, Math.min(3, requestedDuration * 0.02))
  if (Math.abs(duration - requestedDuration) > allowedDifference) {
    throw new Error(`The generated clip is ${duration.toFixed(2)} seconds; the requested interval is ${requestedDuration} seconds (tolerance ${allowedDifference.toFixed(2)} seconds).`)
  }
  const formatName = nonEmptyString(probe.format?.format_name)?.toLowerCase() ?? ''
  const majorBrand = nonEmptyString(probe.format?.tags?.major_brand)?.trim().toLowerCase() ?? ''
  const mp4Brands = new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'iso7', 'iso8', 'iso9', 'mp41', 'mp42', 'avc1', 'm4v', 'm4vh', 'm4vp', 'm4a', 'm4b', 'm4p', 'msnv', 'dash'])
  const isMp4 = formatName.split(',').includes('mp4') && mp4Brands.has(majorBrand)
  if (requireMp4 && !isMp4) throw new Error('The generated file is not in an MP4-compatible container.')
  return { durationSeconds: duration, width, height, videoCodec, audioCodec, isMp4 }
}

export async function probeMedia(tools: MediaTools, filePath: string): Promise<ProbeInfo> {
  const result = await runChildProcess(tools.ffprobe, [
    '-v', 'error', '-show_entries', 'format=format_name,duration,size:format_tags=major_brand:stream=codec_type,codec_name,width,height,duration',
    '-of', 'json', filePath,
  ], { timeoutMs: 30_000 })
  try {
    const value: unknown = JSON.parse(result.stdout)
    if (typeof value !== 'object' || value === null) throw new Error('Invalid probe JSON')
    return value as ProbeInfo
  } catch {
    throw new Error('FFprobe returned invalid media information.')
  }
}

export async function makeCompatibleMp4(
  tools: MediaTools,
  sourcePath: string,
  destinationPath: string,
  info: ValidatedMedia,
  onProgress: (progress: Pick<ClipProgress, 'stage' | 'percent' | 'speed' | 'etaSeconds' | 'message'>) => void,
  signal: AbortSignal,
): Promise<string> {
  const alreadyCompatible = path.extname(sourcePath).toLowerCase() === '.mp4'
    && info.isMp4 && info.videoCodec === 'h264' && info.audioCodec === 'aac'
  if (alreadyCompatible) return sourcePath

  const needsVideoEncode = info.videoCodec !== 'h264'
  const needsAudioEncode = info.audioCodec !== 'aac'
  const args = [
    '-hide_banner', '-nostdin', '-y', '-i', sourcePath,
    '-map', '0:v:0', '-map', '0:a:0', '-sn', '-dn',
    '-c:v', needsVideoEncode ? tools.h264Encoder : 'copy',
  ]
  if (needsVideoEncode && tools.h264Encoder === 'libx264') args.push('-preset', 'medium', '-crf', '20')
  if (needsVideoEncode && tools.h264Encoder === 'h264_mf') args.push('-b:v', '6M')
  args.push('-c:a', needsAudioEncode ? 'aac' : 'copy')
  if (needsAudioEncode) args.push('-b:a', '192k')
  args.push('-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', '-f', 'mp4', destinationPath)

  onProgress({ stage: 'processing', percent: null, speed: null, etaSeconds: null, message: 'Converting media streams to a compatible MP4…' })
  await runChildProcess(tools.ffmpeg, args, {
    signal,
    timeoutMs: 12 * 60 * 60 * 1000,
    outputLimitBytes: 4 * 1024 * 1024,
    onLine: (stream, line) => {
      if (stream !== 'stdout') return
      const outTime = /^out_time_(?:us|ms)=(\d+)/.exec(line)
      if (outTime) {
        const seconds = Number(outTime[1]) / 1_000_000
        onProgress({
          stage: 'processing',
          percent: Math.max(0, Math.min(100, seconds / info.durationSeconds * 100)),
          speed: null,
          etaSeconds: null,
          message: 'Converting media streams to a compatible MP4…',
        })
      }
    },
  })
  return destinationPath
}
