export function isYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
    const host = url.hostname.toLowerCase()
    const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com'])
    const shortHosts = new Set(['youtu.be', 'www.youtu.be'])
    const videoIdPattern = /^[A-Za-z0-9_-]{6,}$/
    if (shortHosts.has(host)) return videoIdPattern.test(/^\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? '')
    if (!youtubeHosts.has(host)) return false
    if (url.pathname === '/watch') return videoIdPattern.test(url.searchParams.get('v') ?? '')
    const match = /^\/(?:live|shorts)\/([^/]+)\/?$/.exec(url.pathname)
    return videoIdPattern.test(match?.[1] ?? '')
  } catch {
    return false
  }
}
