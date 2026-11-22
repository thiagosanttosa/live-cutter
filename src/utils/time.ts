export function parseTime(value: string): number | null {
  const match = /^(\d{2,}):(\d{2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const [, hours, minutes, seconds] = match
  const minuteValue = Number(minutes)
  const secondValue = Number(seconds)
  if (minuteValue > 59 || secondValue > 59) return null
  return Number(hours) * 3600 + minuteValue * 60 + secondValue
}

export function formatTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}

export function validateRange(start: string, end: string, maximumSeconds: number | null = null): string | null {
  if (!start || !end) return 'Enter both start and end times.'
  const startSeconds = parseTime(start)
  const endSeconds = parseTime(end)
  if (startSeconds === null || endSeconds === null) return 'Use the HH:MM:SS format (minutes and seconds must be 00–59).'
  if (endSeconds <= startSeconds) return 'End time must be later than start time.'
  if (maximumSeconds !== null && endSeconds > maximumSeconds) return 'End time exceeds the video duration.'
  return null
}
