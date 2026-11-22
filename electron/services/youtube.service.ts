import { spawn } from 'node:child_process'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { normalizeVideoMetadata } from '../../src/utils/metadata.ts'
import type { VideoLookupErrorCode, VideoLookupResponse } from '../../src/types/video.ts'
import { isYouTubeUrl } from '../../src/utils/youtube.ts'

const QUERY_TIMEOUT_MS = 60_000
const VERSION_TIMEOUT_MS = 8_000
const OUTPUT_LIMIT_BYTES = 24 * 1024 * 1024
const STDERR_LIMIT_CHARS = 12_000
const MIN_SUPPORTED_VERSION = '2024.08.06'

class LookupError extends Error {
  readonly code: VideoLookupErrorCode

  constructor(code: VideoLookupErrorCode, message: string) {
    super(message)
    this.name = 'LookupError'
    this.code = code
  }
}

type SpawnFunction = (command: string, args: string[], options: SpawnOptions) => ChildProcess

export function runYtDlp(
  executable: string,
  args: string[],
  timeoutMs: number,
  spawnProcess: SpawnFunction = spawn,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess
    try {
      child = spawnProcess(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch {
      reject(new LookupError('YTDLP_NOT_FOUND', 'yt-dlp was not found. Add yt-dlp.exe to vendor/yt-dlp and restart the app.'))
      return
    }

    let stdout = ''
    let stderr = ''
    let settled = false
    const settle = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      callback()
    }
    const timer = setTimeout(() => {
      child.kill()
      settle(() => reject(new LookupError('TIMEOUT', 'The video information request timed out. Try again later.')))
    }, timeoutMs)

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      if (settled) return
      stdout += chunk
      if (Buffer.byteLength(stdout, 'utf8') > OUTPUT_LIMIT_BYTES) {
        child.kill()
        settle(() => reject(new LookupError('METADATA_PARSE', 'The video returned too much metadata to process safely.')))
      }
    })
    child.stderr?.on('data', (chunk: string) => {
      if (!settled && stderr.length < STDERR_LIMIT_CHARS) stderr += chunk.slice(0, STDERR_LIMIT_CHARS - stderr.length)
    })
    child.once('error', (error: NodeJS.ErrnoException) => {
      settle(() => reject(error.code === 'ENOENT'
        ? new LookupError('YTDLP_NOT_FOUND', 'yt-dlp is not installed. Add yt-dlp.exe to vendor/yt-dlp and restart the app.')
        : new LookupError('PROCESS', 'Could not start the video information request.')))
    })
    child.once('close', (code) => {
      settle(() => {
        if (code === 0) {
          resolve(stdout)
          return
        }
        if (process.env.NODE_ENV !== 'production' && stderr) {
          const safeStderr = stderr.replace(/https?:\/\/\S+/gi, '[URL]').slice(0, STDERR_LIMIT_CHARS)
          console.error('[LIVE CUTTER] yt-dlp stderr:', safeStderr)
        }
        const detail = stderr.toLowerCase()
        if (/private|members-only|sign in|login required|unavailable|removed|not available/.test(detail)) {
          reject(new LookupError('VIDEO_UNAVAILABLE', 'This video is private, removed, or unavailable to yt-dlp.'))
        } else if (/timed out|timeout|network|unable to download webpage|connection|temporary failure/.test(detail)) {
          reject(new LookupError('NETWORK', 'Could not reach YouTube. Check your internet connection and try again.'))
        } else {
          reject(new LookupError('PROCESS', 'yt-dlp could not read this video. It may be unavailable or access restricted.'))
        }
      })
    })
  })
}

function compareVersions(actual: string, minimum: string): number | null {
  const actualParts = actual.match(/^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/)?.[0].split('.').map(Number)
  if (!actualParts) return null
  const minimumParts = minimum.split('.').map(Number)
  for (let index = 0; index < minimumParts.length; index += 1) {
    const difference = (actualParts[index] ?? 0) - minimumParts[index]
    if (difference !== 0) return Math.sign(difference)
  }
  return 0
}

export async function queryVideo(
  executable: string,
  url: string,
  runProcess: typeof runYtDlp = runYtDlp,
): Promise<VideoLookupResponse> {
  if (!isYouTubeUrl(url)) return { ok: false, error: { code: 'INVALID_URL', message: 'Enter a valid HTTPS YouTube video URL.' } }

  try {
    const versionOutput = await runProcess(executable, ['--ignore-config', '--version'], VERSION_TIMEOUT_MS)
    const version = versionOutput.trim()
    const comparison = compareVersions(version, MIN_SUPPORTED_VERSION)
    if (comparison === null || comparison < 0) {
      throw new LookupError('YTDLP_INCOMPATIBLE', `yt-dlp ${version || '(unknown version)'} is not supported. Install version ${MIN_SUPPORTED_VERSION} or newer.`)
    }

    const output = await runProcess(executable, [
      '--ignore-config', '--no-cookies', '--no-cache-dir', '--no-warnings', '--no-progress',
      '--no-playlist', '--dump-single-json', '--skip-download', '--', url.trim(),
    ], QUERY_TIMEOUT_MS)

    let parsed: unknown
    try {
      parsed = JSON.parse(output)
    } catch {
      throw new LookupError('METADATA_PARSE', 'yt-dlp returned video information in an unexpected format.')
    }
    return { ok: true, data: normalizeVideoMetadata(parsed), version }
  } catch (error) {
    if (error instanceof LookupError) {
      if (process.env.NODE_ENV !== 'production') console.error('[LIVE CUTTER] video lookup failed:', error.code, error.message)
      return { ok: false, error: { code: error.code, message: error.message } }
    }
    if (process.env.NODE_ENV !== 'production') console.error('[LIVE CUTTER] video lookup failed:', error)
    return { ok: false, error: { code: 'PROCESS', message: 'The video could not be checked. Please try again.' } }
  }
}
