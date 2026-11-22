export interface ClipFormValues {
  url: string
  start: string
  end: string
}

export type FormErrors = Partial<Record<keyof ClipFormValues, string>>

export interface VideoFormat {
  id: string | null
  ext: string | null
  resolution: string | null
  height: number | null
  width: number | null
  videoCodec: string | null
  audioCodec: string | null
  sizeBytes: number | null
  approximateSizeBytes: number | null
}

export interface VideoMetadata {
  id: string | null
  title: string | null
  uploader: string | null
  channel: string | null
  duration: number | null
  thumbnail: string | null
  webpageUrl: string | null
  availability: string | null
  formats: VideoFormat[]
}

export type VideoLookupErrorCode =
  | 'INVALID_URL'
  | 'YTDLP_NOT_FOUND'
  | 'YTDLP_INCOMPATIBLE'
  | 'TIMEOUT'
  | 'VIDEO_UNAVAILABLE'
  | 'NETWORK'
  | 'METADATA_PARSE'
  | 'PROCESS'

export type VideoLookupResponse =
  | { ok: true; data: VideoMetadata; version: string }
  | { ok: false; error: { code: VideoLookupErrorCode; message: string } }

export interface ClipRequest {
  url: string
  start: string
  end: string
}

export type ClipStage = 'preparing' | 'downloading' | 'processing' | 'validating' | 'finalizing' | 'completed' | 'error' | 'cancelled'

export interface ClipProgress {
  jobId: string
  stage: ClipStage
  message: string
  percent: number | null
  speed: string | null
  etaSeconds: number | null
  elapsedSeconds: number
  videoTitle: string
}

export interface ClipOutput {
  jobId: string
  fileName: string
  outputPath: string
  outputDirectory: string
  createdAt: string
  start: string
  end: string
  durationSeconds: number
  width: number
  height: number
  videoCodec: string
  audioCodec: string
  fileSizeBytes: number
  historyWarning?: string
}

export type OutputQuality = 'original' | 'compatibility'

export interface UserSettings {
  outputDirectory: string
  fileNamingPattern: string
  quality: OutputQuality
}

export interface SystemComponentStatus {
  available: boolean
  version: string | null
  message: string
}

export interface SystemStatus {
  app: SystemComponentStatus
  ytDlp: SystemComponentStatus
  ffmpeg: SystemComponentStatus
  ffprobe: SystemComponentStatus
  outputFolder: { path: string; available: boolean; message: string }
}

export type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready-to-install' | 'installing' | 'error' | 'not-configured'

export interface AppUpdateState {
  currentVersion: string
  platform: string
  status: UpdateStatus
  latestVersion: string | null
  releaseName: string | null
  releaseNotes: string | null
  releaseDate: string | null
  downloadSizeBytes: number | null
  percent: number | null
  transferredBytes: number | null
  totalBytes: number | null
  isProcessingClip: boolean
  canCheck: boolean
  canDownload: boolean
  canCancel: boolean
  canInstall: boolean
  message: string
}

export type ClipHistoryStatus = 'completed' | 'cancelled' | 'error'

export interface ClipHistoryEntry {
  id: string
  fileName: string | null
  outputDirectory: string | null
  title: string
  createdAt: string
  start: string
  end: string
  durationSeconds: number | null
  width: number | null
  height: number | null
  fileSizeBytes: number | null
  status: ClipHistoryStatus
  quality: OutputQuality
  message: string | null
}

export type ClipStartResponse =
  | { ok: true; jobId: string }
  | { ok: false; message: string }

export type ClipFinishedResponse =
  | { ok: true; output: ClipOutput }
  | { ok: false; jobId: string; message: string; cancelled: boolean }

export interface ClipProgressEvent extends ClipProgress {
  terminal?: ClipFinishedResponse
}
