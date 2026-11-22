import { EventEmitter } from 'node:events'
import type { CancellationToken, UpdateCheckResult, UpdateInfo } from 'electron-updater'
import type { AppUpdateState, UpdateStatus } from '../../src/types/video.ts'

export interface UpdateProviderPort extends EventEmitter {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  checkForUpdates(): Promise<UpdateCheckResult | null>
  downloadUpdate(cancellationToken?: CancellationToken): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

export interface UpdateProviderConfiguration {
  configured: boolean
  message: string
}

export function inspectUpdateProviderConfiguration(
  input: { isPackaged: boolean; platform: string; appUpdateConfig: string | null },
): UpdateProviderConfiguration {
  if (input.platform !== 'win32') return { configured: false, message: 'Application updates are configured for Windows x64 builds only.' }
  if (!input.isPackaged) return { configured: false, message: 'Update checks are disabled in development builds.' }
  if (!input.appUpdateConfig) return { configured: false, message: 'No update source is configured for this build. Configure a GitHub Releases provider and rebuild the signed installer.' }

  const provider = /^provider:\s*["']?([^\r\n"']+)/m.exec(input.appUpdateConfig)?.[1]?.trim()
  const owner = /^owner:\s*["']?([^\r\n"']+)/m.exec(input.appUpdateConfig)?.[1]?.trim()
  const repo = /^repo:\s*["']?([^\r\n"']+)/m.exec(input.appUpdateConfig)?.[1]?.trim()
  const publisherName = /^publisherName:\s*["']?([^\r\n"']+)/m.exec(input.appUpdateConfig)?.[1]?.trim()
  const verificationDisabled = /^verifyUpdateCodeSignature:\s*false\s*$/m.test(input.appUpdateConfig)
  if (provider !== 'github' || !owner || !repo) {
    return { configured: false, message: 'The update source is not a valid GitHub Releases configuration.' }
  }
  if (verificationDisabled || !publisherName) {
    return { configured: false, message: 'Secure updates require Authenticode signature verification and a configured publisher certificate.' }
  }
  return { configured: true, message: 'Secure GitHub Releases updates are configured for this signed Windows build.' }
}

function formatReleaseNotes(info: UpdateInfo): string | null {
  const notes = info.releaseNotes
  const text = typeof notes === 'string'
    ? notes
    : Array.isArray(notes)
      ? notes.map((entry) => `${entry.version ? `${entry.version}\n` : ''}${entry.note}`).join('\n\n')
      : ''
  const clean = text.trim()
  return clean ? clean.slice(0, 12_000) : null
}

function versionInformation(info: UpdateInfo | null) {
  if (!info) return { latestVersion: null, releaseName: null, releaseNotes: null, releaseDate: null, downloadSizeBytes: null }
  const releaseDate = typeof info.releaseDate === 'string' && Number.isFinite(Date.parse(info.releaseDate)) ? info.releaseDate : null
  const sizes = Array.isArray(info.files) ? info.files.map((file) => file.size).filter((size): size is number => typeof size === 'number' && Number.isFinite(size) && size > 0) : []
  return {
    latestVersion: info.version,
    releaseName: typeof info.releaseName === 'string' && info.releaseName.length <= 200 ? info.releaseName : null,
    releaseNotes: formatReleaseNotes(info),
    releaseDate,
    downloadSizeBytes: sizes.length ? Math.max(...sizes) : null,
  }
}

export class UpdateService {
  private readonly updater: UpdateProviderPort
  private readonly configuration: UpdateProviderConfiguration
  private readonly currentVersion: string
  private readonly platform: string
  private readonly isProcessing: () => boolean
  private readonly listeners = new Set<(state: AppUpdateState) => void>()
  private status: UpdateStatus
  private message: string
  private updateInfo: UpdateInfo | null = null
  private cancellationToken: CancellationToken | undefined
  private cancelRequested = false
  private percent: number | null = null
  private transferredBytes: number | null = null
  private totalBytes: number | null = null

  constructor(input: {
    updater: UpdateProviderPort
    configuration: UpdateProviderConfiguration
    currentVersion: string
    platform: string
    isProcessing: () => boolean
  }) {
    this.updater = input.updater
    this.configuration = input.configuration
    this.currentVersion = input.currentVersion
    this.platform = input.platform
    this.isProcessing = input.isProcessing
    this.status = input.configuration.configured ? 'idle' : 'not-configured'
    this.message = input.configuration.message

    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = false
    this.updater.allowPrerelease = false
    this.updater.on('checking-for-update', () => this.setState('checking', 'Checking for a newer LIVE CUTTER version…'))
    this.updater.on('update-available', (info: UpdateInfo) => {
      this.updateInfo = info
      this.setState('available', `Version ${info.version} is available. Choose Download Update to continue.`)
    })
    this.updater.on('update-not-available', () => {
      this.updateInfo = null
      this.cancellationToken = undefined
      this.setState('up-to-date', "You're using the latest version of LIVE CUTTER.")
    })
    this.updater.on('download-progress', (progress: { percent?: unknown; transferred?: unknown; total?: unknown }) => {
      if (this.status !== 'downloading') return
      this.percent = typeof progress.percent === 'number' && Number.isFinite(progress.percent)
        ? Math.max(0, Math.min(100, progress.percent)) : null
      this.transferredBytes = typeof progress.transferred === 'number' && Number.isFinite(progress.transferred) ? Math.max(0, progress.transferred) : null
      this.totalBytes = typeof progress.total === 'number' && Number.isFinite(progress.total) ? Math.max(0, progress.total) : null
      this.emit()
    })
    this.updater.on('update-downloaded', (info: UpdateInfo) => {
      this.updateInfo = info
      this.cancellationToken = undefined
      this.cancelRequested = false
      this.percent = 100
      this.setState('ready-to-install', 'Update downloaded and verified. Restart the application to install it.')
    })
    this.updater.on('update-cancelled', () => {
      if (this.cancelRequested) {
        this.cancelRequested = false
        this.setState('available', 'Update download cancelled. You can start it again when ready.')
      }
    })
    this.updater.on('error', (error: Error) => {
      if (this.cancelRequested) return
      this.cancellationToken = undefined
      this.setState('error', `Unable to check for or download updates: ${error.message.slice(0, 600)}`)
    })
  }

  getState(): AppUpdateState {
    const processing = this.isProcessing()
    const info = versionInformation(this.updateInfo)
    return {
      currentVersion: this.currentVersion,
      platform: this.platform,
      status: this.status,
      ...info,
      percent: this.percent,
      transferredBytes: this.transferredBytes,
      totalBytes: this.totalBytes,
      isProcessingClip: processing,
      canCheck: this.configuration.configured && ['idle', 'up-to-date', 'available', 'error'].includes(this.status),
      canDownload: this.configuration.configured && this.status === 'available' && Boolean(this.cancellationToken),
      canCancel: this.status === 'downloading' && !this.cancelRequested,
      canInstall: this.configuration.configured && this.status === 'ready-to-install' && !processing,
      message: this.status === 'not-configured' ? this.configuration.message : this.message,
    }
  }

  subscribe(listener: (state: AppUpdateState) => void): () => void {
    this.listeners.add(listener)
    listener(this.getState())
    return () => this.listeners.delete(listener)
  }

  async checkForUpdates(): Promise<AppUpdateState> {
    if (!this.configuration.configured) return this.getState()
    if (['checking', 'downloading', 'ready-to-install', 'installing'].includes(this.status)) return this.getState()
    this.updateInfo = null
    this.cancellationToken = undefined
    this.percent = null
    this.transferredBytes = null
    this.totalBytes = null
    this.setState('checking', 'Checking for a newer LIVE CUTTER version…')
    try {
      const result = await this.updater.checkForUpdates()
      if (!result) {
        if (this.status === 'checking') this.setState('error', 'The update service returned no result. Please try again later.')
        return this.getState()
      }
      this.updateInfo = result.updateInfo
      this.cancellationToken = result.cancellationToken
      if (result.isUpdateAvailable) this.setState('available', `Version ${result.updateInfo.version} is available. Choose Download Update to continue.`)
      else this.setState('up-to-date', "You're using the latest version of LIVE CUTTER.")
    } catch (error) {
      this.setState('error', `Unable to check for updates. ${error instanceof Error ? error.message.slice(0, 500) : 'Please try again later.'}`)
    }
    return this.getState()
  }

  async downloadUpdate(): Promise<AppUpdateState> {
    if (!this.configuration.configured || this.status !== 'available' || !this.cancellationToken) return this.getState()
    this.cancelRequested = false
    this.percent = null
    this.transferredBytes = 0
    this.totalBytes = this.getState().downloadSizeBytes
    this.setState('downloading', 'Downloading the verified update…')
    try {
      await this.updater.downloadUpdate(this.cancellationToken)
      if (this.getState().status === 'downloading') this.setState('ready-to-install', 'Update downloaded and verified. Restart the application to install it.')
    } catch (error) {
      if (!this.cancelRequested) this.setState('error', `The update download failed: ${error instanceof Error ? error.message.slice(0, 500) : 'Please try again later.'}`)
    }
    return this.getState()
  }

  cancelDownload(): AppUpdateState {
    if (this.status !== 'downloading' || !this.cancellationToken) return this.getState()
    this.cancelRequested = true
    const token = this.cancellationToken
    this.cancellationToken = undefined
    this.setState('downloading', 'Cancelling the update download…')
    token.cancel()
    return this.getState()
  }

  installUpdate(): AppUpdateState {
    if (!this.configuration.configured || this.status !== 'ready-to-install') return this.getState()
    if (this.isProcessing()) {
      this.message = 'A clip is still being processed. Wait for it to finish before installing the update.'
      this.emit()
      return this.getState()
    }
    this.setState('installing', 'Restarting LIVE CUTTER to install the update…')
    try { this.updater.quitAndInstall(false, true) }
    catch (error) { this.setState('error', `The update could not be installed: ${error instanceof Error ? error.message.slice(0, 500) : 'Please restart and try again.'}`) }
    return this.getState()
  }

  refreshProcessingStatus(): AppUpdateState { this.emit(); return this.getState() }

  private setState(status: UpdateStatus, message: string): void {
    this.status = status
    this.message = message
    this.emit()
  }

  private emit(): void {
    const state = this.getState()
    for (const listener of this.listeners) listener(state)
  }
}
