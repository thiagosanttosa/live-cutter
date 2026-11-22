import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, link, mkdir, readdir, rm, stat, statfs } from 'node:fs/promises'
import path from 'node:path'
import type {
  ClipFinishedResponse, ClipHistoryEntry, ClipOutput, ClipProgress, ClipProgressEvent, ClipRequest, UserSettings,
} from '../../src/types/video.ts'
import { validateClipRequest } from '../../src/utils/clip.ts'
import { buildOutputFileName } from '../../src/utils/naming.ts'
import { isYouTubeUrl } from '../../src/utils/youtube.ts'
import { queryVideo } from './youtube.service.ts'
import { downloadClip } from './download.service.ts'
import { getMediaTools, makeCompatibleMp4, probeMedia, validateProbeResult } from './ffmpeg.service.ts'
import type { MediaTools } from './ffmpeg.service.ts'
import { ChildProcessError } from './process.service.ts'
import { createDefaultSettings } from './settings.service.ts'

const MEBIBYTE = 1024 * 1024
const BASE_FREE_SPACE = 256 * MEBIBYTE
const MIN_FREE_SPACE = 512 * MEBIBYTE
const JOBS_FOLDER = 'live-cutter'
const FINAL_FOLDER = 'LIVE CUTTER'

export interface ClipServicePaths {
  ytDlp: string | null
  ffmpeg: string | null
  ffprobe: string | null
  ffmpegDirectory: string | null
  videosDirectory: string
  temporaryDirectory: string
  loadSettings?: () => Promise<UserSettings>
  recordHistory?: (entry: ClipHistoryEntry) => Promise<void>
}

interface ActiveJob {
  jobId: string
  controller: AbortController
  promise: Promise<void>
  startedAt: number
  finishing: boolean
}

export class ClipService {
  private activeJob: ActiveJob | null = null
  private readonly completedOutputs = new Map<string, ClipOutput>()
  private readonly paths: ClipServicePaths

  constructor(paths: ClipServicePaths) { this.paths = paths }

  get isBusy(): boolean { return this.activeJob !== null }

  start(requestValue: unknown, emit: (event: ClipProgressEvent) => void): { ok: true; jobId: string } | { ok: false; message: string } {
    if (this.activeJob) return { ok: false, message: 'A clip is already being processed. Wait for it to finish or cancel it first.' }
    if (typeof requestValue !== 'object' || requestValue === null) return { ok: false, message: 'The clip request is invalid.' }
    const value = requestValue as Record<string, unknown>
    if (typeof value.url !== 'string' || typeof value.start !== 'string' || typeof value.end !== 'string'
      || value.url.length > 2_048 || value.start.length > 16 || value.end.length > 16) {
      return { ok: false, message: 'Enter a valid YouTube URL and both clip timestamps.' }
    }
    const request: ClipRequest = { url: value.url, start: value.start, end: value.end }
    if (!isYouTubeUrl(request.url)) return { ok: false, message: 'Enter a valid HTTPS YouTube video URL.' }

    const jobId = randomUUID()
    const controller = new AbortController()
    const job: ActiveJob = { jobId, controller, promise: Promise.resolve(), startedAt: Date.now(), finishing: false }
    this.activeJob = job
    job.promise = Promise.resolve().then(() => this.execute(request, job, emit))
    return { ok: true, jobId }
  }

  cancel(jobId: unknown): boolean {
    if (typeof jobId !== 'string' || !this.activeJob || this.activeJob.jobId !== jobId || this.activeJob.finishing) return false
    this.activeJob.controller.abort()
    return true
  }

  async cancelAndWait(): Promise<void> {
    const job = this.activeJob
    if (!job) return
    if (!job.finishing) job.controller.abort()
    await job.promise
  }

  async openResult(jobId: unknown, mode: unknown): Promise<string | null> {
    if (typeof jobId !== 'string' || (mode !== 'file' && mode !== 'folder')) return 'The requested clip is not available.'
    const result = this.completedOutputs.get(jobId)
    if (!result) return 'The completed clip is no longer available in this session.'
    try {
      if (mode === 'folder') {
        const { shell } = await import('electron')
        shell.showItemInFolder(result.outputPath)
        return null
      }
      const { shell } = await import('electron')
      return await shell.openPath(result.outputPath) || null
    } catch {
      return 'Windows could not open the selected clip.'
    }
  }

  private send(
    job: ActiveJob,
    emit: (event: ClipProgressEvent) => void,
    progress: Omit<ClipProgress, 'jobId' | 'videoTitle' | 'elapsedSeconds'>,
    videoTitle: string,
    terminal?: ClipFinishedResponse,
  ): void {
    emit({ ...progress, jobId: job.jobId, videoTitle, elapsedSeconds: Math.max(0, Math.floor((Date.now() - job.startedAt) / 1000)), ...(terminal ? { terminal } : {}) })
  }

  private async execute(request: ClipRequest, job: ActiveJob, emit: (event: ClipProgressEvent) => void): Promise<void> {
    let title = 'YouTube clip'
    let jobDirectory: string | null = null
    let publishedPath: string | null = null
    const operationStartedAt = new Date().toISOString()
    let settings = createDefaultSettings(path.join(this.paths.videosDirectory, FINAL_FOLDER))
    let terminalEvent: { stage: 'completed' | 'error' | 'cancelled'; message: string; percent: number | null; response: ClipFinishedResponse } | null = null
    try {
      this.send(job, emit, { stage: 'preparing', message: 'Checking the video, tools and available disk space…', percent: null, speed: null, etaSeconds: null }, title)
      if (this.paths.loadSettings) settings = await this.paths.loadSettings()
      if (!this.paths.ytDlp) throw new Error('yt-dlp is missing. Install it or add it to the application resources.')
      if (!this.paths.ffmpeg || !this.paths.ffprobe) {
        throw new Error('FFmpeg and FFprobe are required. Install the Windows FFmpeg build described in README.md.')
      }
      const metadataResponse = await queryVideo(this.paths.ytDlp, request.url)
      if (job.controller.signal.aborted) throw new ChildProcessError('CANCELLED', 'The operation was cancelled.')
      if (!metadataResponse.ok) throw new Error(metadataResponse.error.message)
      const metadata = metadataResponse.data
      title = metadata.title ?? metadata.id ?? title
      if (metadata.duration === null) throw new Error('The video duration is unavailable, so this clip range cannot be verified.')
      const range = validateClipRequest(request, metadata.duration)
      const mediaTools: MediaTools = await getMediaTools(this.paths.ffmpeg, this.paths.ffprobe, this.paths.ffmpegDirectory)
      if (job.controller.signal.aborted) throw new ChildProcessError('CANCELLED', 'The operation was cancelled.')

      const finalDirectory = settings.outputDirectory
      const temporaryRoot = path.join(this.paths.temporaryDirectory, JOBS_FOLDER)
      await Promise.all([mkdir(finalDirectory, { recursive: true }), mkdir(temporaryRoot, { recursive: true })])
      jobDirectory = path.join(temporaryRoot, `job-${job.jobId}`)
      await mkdir(jobDirectory)
      await this.checkFreeSpace(finalDirectory, temporaryRoot, metadata.formats, metadata.duration, range.durationSeconds)

      this.send(job, emit, { stage: 'downloading', message: 'Downloading only the selected section…', percent: null, speed: null, etaSeconds: null }, title)
      await downloadClip({
        executable: this.paths.ytDlp,
        ffmpegLocation: this.paths.ffmpegDirectory ?? undefined,
        request,
        video: metadata,
        quality: settings.quality,
        outputTemplate: path.join(jobDirectory, 'source.%(ext)s'),
        jobId: job.jobId,
        signal: job.controller.signal,
        onProgress: (progress) => this.send(job, emit, progress, title),
      })

      this.send(job, emit, { stage: 'validating', message: 'Checking the downloaded clip with FFprobe…', percent: null, speed: null, etaSeconds: null }, title)
      const sourcePath = await this.findDownloadedFile(jobDirectory)
      const sourceProbe = await probeMedia(mediaTools, sourcePath)
      const sourceMedia = validateProbeResult(sourceProbe, range.durationSeconds, false)
      const convertedPath = path.join(jobDirectory, 'compatible.mp4')
      const mp4Path = await makeCompatibleMp4(
        mediaTools, sourcePath, convertedPath, sourceMedia,
        (progress) => this.send(job, emit, progress, title),
        job.controller.signal,
      )

      this.send(job, emit, { stage: 'validating', message: 'Verifying the final MP4 audio, video and duration…', percent: null, speed: null, etaSeconds: null }, title)
      const finalProbe = await probeMedia(mediaTools, mp4Path)
      const finalMedia = validateProbeResult(finalProbe, range.durationSeconds)
      if (job.controller.signal.aborted) throw new ChildProcessError('CANCELLED', 'The operation was cancelled.')

      const createdAt = new Date().toISOString()
      const date = localDate(new Date(createdAt))
      const requestedName = buildOutputFileName(settings.fileNamingPattern, {
        title, start: request.start, end: request.end, date,
      })
      this.send(job, emit, { stage: 'finalizing', message: 'Saving the verified MP4 and updating clip history…', percent: null, speed: null, etaSeconds: null }, title)
      publishedPath = await this.publishUniqueFile(mp4Path, finalDirectory, requestedName)
      const fileInfo = await stat(publishedPath)
      const output: ClipOutput = {
        jobId: job.jobId,
        fileName: path.basename(publishedPath),
        outputPath: publishedPath,
        outputDirectory: finalDirectory,
        createdAt,
        start: request.start,
        end: request.end,
        durationSeconds: finalMedia.durationSeconds,
        width: finalMedia.width,
        height: finalMedia.height,
        videoCodec: finalMedia.videoCodec,
        audioCodec: finalMedia.audioCodec,
        fileSizeBytes: fileInfo.size,
      }
      if (job.controller.signal.aborted) {
        await rm(publishedPath, { force: true })
        publishedPath = null
        throw new ChildProcessError('CANCELLED', 'The operation was cancelled.')
      }
      job.finishing = true
      this.completedOutputs.set(job.jobId, output)
      while (this.completedOutputs.size > 10) this.completedOutputs.delete(this.completedOutputs.keys().next().value as string)
      terminalEvent = { stage: 'completed', message: 'Clip created and validated.', percent: 100, response: { ok: true, output } }
    } catch (error) {
      if (publishedPath) await rm(publishedPath, { force: true }).catch(() => undefined)
      const cancelled = job.controller.signal.aborted || (error instanceof ChildProcessError && error.code === 'CANCELLED')
      const message = cancelled ? 'Clip cancelled; temporary files were removed.' : safeUserError(error)
      if (!cancelled && process.env.NODE_ENV !== 'production') {
        const detail = error instanceof ChildProcessError ? error.stderr : error instanceof Error ? error.stack ?? error.message : error
        console.error('[LIVE CUTTER] clip job failed:', redact(String(detail)))
      }
      const response: ClipFinishedResponse = { ok: false, jobId: job.jobId, message, cancelled }
      terminalEvent = { stage: cancelled ? 'cancelled' : 'error', message, percent: null, response }
      job.finishing = true
    } finally {
      if (jobDirectory) await rm(jobDirectory, { recursive: true, force: true }).catch(() => undefined)
    }
    if (terminalEvent) {
      if (this.paths.recordHistory) {
        const succeeded = terminalEvent.response.ok
        const output = succeeded ? terminalEvent.response.output : null
        const historyEntry: ClipHistoryEntry = {
          id: job.jobId,
          fileName: output?.fileName ?? null,
          outputDirectory: output?.outputDirectory ?? null,
          title,
          createdAt: output?.createdAt ?? operationStartedAt,
          start: request.start,
          end: request.end,
          durationSeconds: output?.durationSeconds ?? null,
          width: output?.width ?? null,
          height: output?.height ?? null,
          fileSizeBytes: output?.fileSizeBytes ?? null,
          status: succeeded ? 'completed' : terminalEvent.stage,
          quality: settings.quality,
          message: succeeded ? null : terminalEvent.message,
        }
        try {
          await this.paths.recordHistory(historyEntry)
        } catch (error) {
          console.error('[LIVE CUTTER] could not persist clip history:', error)
          if (succeeded) terminalEvent.response.output.historyWarning = 'The clip was created, but its history entry could not be saved.'
        }
      }
      if (this.activeJob?.jobId === job.jobId) this.activeJob = null
      this.send(job, emit, { stage: terminalEvent.stage, message: terminalEvent.message, percent: terminalEvent.percent, speed: null, etaSeconds: null }, title, terminalEvent.response)
    }
  }

  private async findDownloadedFile(jobDirectory: string): Promise<string> {
    const entries = await readdir(jobDirectory, { withFileTypes: true })
    const candidates = entries.filter((entry) => entry.isFile() && /^source\.(mp4|mkv|webm|mov|m4v|ts)$/i.test(entry.name))
    if (candidates.length === 0) throw new Error('yt-dlp finished without producing a media file.')
    const files = await Promise.all(candidates.map(async (entry) => {
      const filePath = path.join(jobDirectory, entry.name)
      const fileInfo = await stat(filePath)
      return { filePath, size: fileInfo.size }
    }))
    files.sort((left, right) => right.size - left.size)
    if (files[0].size === 0) throw new Error('yt-dlp produced an empty media file.')
    return files[0].filePath
  }

  private async checkFreeSpace(
    outputDirectory: string,
    temporaryDirectory: string,
    formats: { sizeBytes: number | null; approximateSizeBytes: number | null; videoCodec: string | null; audioCodec: string | null }[],
    sourceDuration: number,
    clipDuration: number,
  ): Promise<void> {
    const sizes = formats.map((format) => format.sizeBytes ?? format.approximateSizeBytes).filter((size): size is number => size !== null)
    const bytesPerSecond = sourceDuration > 0 && sizes.length > 0
      ? Math.max(...sizes) / sourceDuration
      : 2 * MEBIBYTE
    const separateVideo = Math.max(0, ...formats.filter((format) => format.videoCodec && !format.audioCodec)
      .map((format) => (format.sizeBytes ?? format.approximateSizeBytes ?? 0) / Math.max(1, sourceDuration)))
    const separateAudio = Math.max(0, ...formats.filter((format) => !format.videoCodec && format.audioCodec)
      .map((format) => (format.sizeBytes ?? format.approximateSizeBytes ?? 0) / Math.max(1, sourceDuration)))
    const estimatedBytes = Math.max(MIN_FREE_SPACE, clipDuration * Math.max(bytesPerSecond, separateVideo + separateAudio) * 2.5) + BASE_FREE_SPACE
    const filesystems = await Promise.all([statfs(outputDirectory), statfs(temporaryDirectory)])
    for (const filesystem of filesystems) {
      const availableBytes = Number(filesystem.bavail) * Number(filesystem.bsize)
      if (availableBytes < estimatedBytes) {
        throw new Error(`There is not enough free disk space. Keep at least ${Math.ceil(estimatedBytes / MEBIBYTE)} MiB free for this clip.`)
      }
    }
  }

  private async publishUniqueFile(source: string, directory: string, requestedName: string): Promise<string> {
    const extension = path.extname(requestedName)
    const stem = path.basename(requestedName, extension)
    for (let suffix = 1; suffix <= 10_000; suffix += 1) {
      const name = suffix === 1 ? requestedName : `${stem}_${suffix}${extension}`
      const destination = path.join(directory, name)
      try {
        await link(source, destination)
        return destination
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') continue
        if (error && typeof error === 'object' && 'code' in error && error.code !== 'EXDEV' && error.code !== 'EPERM' && error.code !== 'ENOTSUP') throw error
        try {
          await copyFile(source, destination, constants.COPYFILE_EXCL)
          return destination
        } catch (copyError) {
          if (copyError && typeof copyError === 'object' && 'code' in copyError && copyError.code === 'EEXIST') continue
          await rm(destination, { force: true }).catch(() => undefined)
          throw copyError
        }
      }
    }
    throw new Error('Could not choose a unique output filename.')
  }
}

function redact(value: string): string {
  return value.replace(/https?:\/\/\S+/gi, '[URL]').slice(0, 8_000)
}

function localDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function safeUserError(error: unknown): string {
  if (error instanceof ChildProcessError) {
    if (error.code === 'NOT_FOUND') return 'A required media tool is missing. Check yt-dlp, FFmpeg and FFprobe installation.'
    if (error.code === 'TIMEOUT') return 'The clip process timed out. Try a shorter interval or check your connection.'
    if (error.code === 'OUTPUT_LIMIT') return 'The media tool returned too much output to process safely.'
    const detail = error.stderr.toLowerCase()
    if (/no space left|not enough space|disk full/.test(detail)) return 'There is not enough free disk space to finish this clip.'
    if (/private|unavailable|removed|sign in|members-only/.test(detail)) return 'This video is unavailable or access restricted.'
    if (/timed out|network|connection|http error/.test(detail)) return 'The connection to YouTube failed while downloading the selected section.'
    return 'A media process failed. Check the installed yt-dlp and FFmpeg versions and try again.'
  }
  const message = error instanceof Error ? error.message : ''
  if (/no space left|not enough space|disk full/i.test(message)) return 'There is not enough free disk space to finish this clip.'
  if (/not found|missing|required.*install/i.test(message)) return message
  return message || 'The clip could not be created. Please try again.'
}
