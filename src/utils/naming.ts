import { sanitizeFilePart } from './clip.ts'

export interface FileNameValues {
  title: string
  start: string
  end: string
  date: string
}

export function buildOutputFileName(pattern: string, values: FileNameValues): string {
  const substitutions: Record<string, string> = {
    title: sanitizeFilePart(values.title, 70),
    start: values.start.replaceAll(':', '-'),
    end: values.end.replaceAll(':', '-'),
    date: sanitizeFilePart(values.date, 10),
  }
  const base = pattern.replace(/\{([^{}]*)\}/g, (_match, token: string) => substitutions[token.toLowerCase()] ?? '')
  return `${sanitizeFilePart(base, 150)}.mp4`
}

export function makeFileNamePreview(pattern: string, now = new Date()): string {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return buildOutputFileName(pattern, {
    title: 'GTA VI Live', start: '02:15:30', end: '02:18:45', date,
  })
}
