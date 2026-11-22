import type { VideoFormat, VideoMetadata } from '../types/video'

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function imageUrlOrNull(value: unknown): string | null {
  const image = stringOrNull(value)
  if (!image) return null
  try {
    const url = new URL(image)
    const host = url.hostname.toLowerCase()
    return url.protocol === 'https:' && (host === 'ytimg.com' || host.endsWith('.ytimg.com')) ? url.toString() : null
  } catch {
    return null
  }
}

function normalizeFormat(value: unknown): VideoFormat | null {
  const format = record(value)
  const id = stringOrNull(format.format_id)
  const ext = stringOrNull(format.ext)
  const height = numberOrNull(format.height)
  const width = numberOrNull(format.width)
  const videoCodec = stringOrNull(format.vcodec)
  const audioCodec = stringOrNull(format.acodec)
  const sizeBytes = numberOrNull(format.filesize)
  const approximateSizeBytes = numberOrNull(format.filesize_approx)
  const rawResolution = stringOrNull(format.resolution)
  const resolution = rawResolution ?? (height ? `${height}p` : videoCodec === 'none' && audioCodec ? 'Audio only' : null)
  if (!id && !ext && !resolution && height === null && width === null && !videoCodec && !audioCodec && sizeBytes === null && approximateSizeBytes === null) return null
  return { id, ext, resolution, height, width, videoCodec: videoCodec === 'none' ? null : videoCodec, audioCodec: audioCodec === 'none' ? null : audioCodec, sizeBytes, approximateSizeBytes }
}

export function normalizeVideoMetadata(value: unknown): VideoMetadata {
  const metadata = record(value)
  const webpageUrl = stringOrNull(metadata.webpage_url)
  let safeWebpageUrl: string | null = null
  if (webpageUrl) {
    try {
      const parsed = new URL(webpageUrl)
      if (parsed.protocol === 'https:' && ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(parsed.hostname.toLowerCase())) safeWebpageUrl = parsed.toString()
    } catch { /* Metadata may omit or contain a malformed URL. */ }
  }
  const formats = Array.isArray(metadata.formats)
    ? metadata.formats.map(normalizeFormat).filter((format): format is VideoFormat => format !== null)
    : []

  return {
    id: stringOrNull(metadata.id),
    title: stringOrNull(metadata.title),
    uploader: stringOrNull(metadata.uploader),
    channel: stringOrNull(metadata.channel),
    duration: numberOrNull(metadata.duration),
    thumbnail: imageUrlOrNull(metadata.thumbnail),
    webpageUrl: safeWebpageUrl,
    availability: stringOrNull(metadata.availability),
    formats,
  }
}
