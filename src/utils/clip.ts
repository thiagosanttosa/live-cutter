import type { ClipProgress, ClipRequest } from '../types/video.ts'
import { formatTime, parseTime, validateRange } from './time.ts'

export interface ValidatedClipRange {
  startSeconds: number
  endSeconds: number
  durationSeconds: number
  section: string
}

export function validateClipRequest(request: ClipRequest, sourceDuration: number | null): ValidatedClipRange {
  const rangeError = validateRange(request.start, request.end, sourceDuration)
  if (rangeError) throw new Error(rangeError)
  const startSeconds = parseTime(request.start)
  const endSeconds = parseTime(request.end)
  if (startSeconds === null || endSeconds === null) throw new Error('Use HH:MM:SS for both timestamps.')
  return {
    startSeconds,
    endSeconds,
    durationSeconds: endSeconds - startSeconds,
    section: `*${formatTime(startSeconds)}-${formatTime(endSeconds)}`,
  }
}

export function sanitizeFilePart(value: string, maxLength = 90): string {
  let safe = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._ ]+|[._ ]+$/g, '')
    .slice(0, maxLength)
    .replace(/[._ ]+$/g, '')
  if (!safe) safe = 'YouTube_clip'
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(safe)) safe = `_${safe}`
  return safe
}

function parsePercent(value: string): number | null {
  const match = /(-?\d+(?:\.\d+)?)\s*%/.exec(value)
  if (!match) return null
  const percent = Number(match[1])
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null
}

function parseEta(value: string): number | null {
  const clean = value.trim()
  if (!clean || clean === 'NA' || clean === 'N/A') return null
  if (/^\d+(?:\.\d+)?$/.test(clean)) return Number(clean)
  const parts = clean.split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return null
  return parts.reduce((total, part) => total * 60 + part, 0)
}

export interface ParsedDownloadProgress {
  status: 'downloading' | 'finished'
  percent: number | null
  speed: string | null
  etaSeconds: number | null
}

export function parseYtDlpProgress(line: string): ParsedDownloadProgress | null {
  const match = /^(?:\[download\]\s*)?LC_PROGRESS\|([^|]+)\|([^|]*)\|([^|]*)\|([^|]*)$/.exec(line.trim())
  if (!match) return null
  const status = match[1].trim()
  if (status !== 'downloading' && status !== 'finished') return null
  const speed = match[3].trim()
  return {
    status,
    percent: parsePercent(match[2]),
    speed: speed && speed !== 'NA' && speed !== 'N/A' ? speed : null,
    etaSeconds: parseEta(match[4]),
  }
}

export function asProgressUpdate(progress: ParsedDownloadProgress): Pick<ClipProgress, 'stage' | 'percent' | 'speed' | 'etaSeconds' | 'message'> {
  return progress.status === 'finished'
    ? { stage: 'processing', percent: null, speed: null, etaSeconds: null, message: 'Preparing the clip…' }
    : { stage: 'downloading', percent: progress.percent, speed: progress.speed, etaSeconds: progress.etaSeconds, message: 'Downloading selected section…' }
}
