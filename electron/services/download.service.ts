import type { ClipProgress, ClipRequest, OutputQuality } from '../../src/types/video.ts'
import { validateClipRequest } from '../../src/utils/clip.ts'
import { runChildProcess } from './process.service.ts'
import type { ProcessLineHandler } from './process.service.ts'
import type { VideoMetadata } from '../../src/types/video.ts'
import { isYouTubeUrl } from '../../src/utils/youtube.ts'

export interface DownloadOptions {
  executable: string
  ffmpegLocation?: string
  quality?: OutputQuality
  request: ClipRequest
  video: VideoMetadata
  outputTemplate: string
  jobId: string
  signal: AbortSignal
  onProgress: (progress: Pick<ClipProgress, 'stage' | 'percent' | 'speed' | 'etaSeconds' | 'message'>) => void
}

const PROGRESS_TEMPLATE = 'download:LC_PROGRESS|%(progress.status)s|%(progress._percent_str)s|%(progress.speed)s|%(progress.eta)s'

export function buildDownloadArgs(options: Pick<DownloadOptions, 'request' | 'video' | 'outputTemplate' | 'ffmpegLocation' | 'quality'>): string[] {
  if (!isYouTubeUrl(options.request.url)) throw new Error('Enter a valid HTTPS YouTube URL.')
  const interval = validateClipRequest(options.request, options.video.duration)
  return [
    '--ignore-config',
    '--no-cookies',
    '--no-cache-dir',
    '--no-playlist',
    '--no-warnings',
    '--newline',
    '--progress-template', PROGRESS_TEMPLATE,
    '--format', options.quality === 'compatibility'
      ? 'bv*[vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/b[ext=mp4][vcodec^=avc1][acodec^=mp4a]/bv*+ba/b'
      : 'bv*+ba/b',
    '--download-sections', interval.section,
    '--force-keyframes-at-cuts',
    '--merge-output-format', 'mp4',
    ...(options.ffmpegLocation ? ['--ffmpeg-location', options.ffmpegLocation] : []),
    '--windows-filenames',
    '--no-overwrites',
    '--output', options.outputTemplate,
    '--', options.request.url.trim(),
  ]
}

function parseLine(progress: DownloadOptions['onProgress']): ProcessLineHandler {
  return (_stream, line) => {
    const match = /^LC_PROGRESS\|([^|]+)\|([^|]*)\|([^|]*)\|([^|]*)$/.exec(line.trim())
    if (!match) return
    const status = match[1].trim()
    const percentMatch = /(-?\d+(?:\.\d+)?)\s*%/.exec(match[2])
    const parsedPercent = percentMatch ? Number(percentMatch[1]) : NaN
    const speed = match[3].trim()
    const etaText = match[4].trim()
    const etaParts = etaText.split(':').map(Number)
    const eta = etaParts.length && etaParts.every(Number.isFinite)
      ? etaParts.reduce((total, part) => total * 60 + part, 0)
      : null
    if (status === 'finished') {
      progress({ stage: 'processing', percent: null, speed: null, etaSeconds: null, message: 'Processing the cut with FFmpeg…' })
    } else if (status === 'downloading') {
      progress({
        stage: 'downloading',
        percent: Number.isFinite(parsedPercent) ? Math.max(0, Math.min(100, parsedPercent)) : null,
        speed: speed && speed !== 'NA' && speed !== 'N/A' ? speed : null,
        etaSeconds: eta,
        message: 'Downloading the selected section…',
      })
    }
  }
}

export async function downloadClip(options: DownloadOptions): Promise<void> {
  const args = buildDownloadArgs(options)
  options.onProgress({ stage: 'downloading', percent: null, speed: null, etaSeconds: null, message: 'Starting the selected section download…' })
  try {
    await runChildProcess(options.executable, args, {
      signal: options.signal,
      timeoutMs: 12 * 60 * 60 * 1000,
      outputLimitBytes: 16 * 1024 * 1024,
      onLine: parseLine(options.onProgress),
    })
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'CANCELLED') throw error
    if (error instanceof Error && 'code' in error && error.code === 'NOT_FOUND') {
      throw new Error('yt-dlp was not found. Place yt-dlp.exe in the application resources or add it to PATH.')
    }
    throw error
  }
}
