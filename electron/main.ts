import type { BrowserWindow } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ClipHistoryEntry, ClipProgressEvent, ClipStartResponse, UserSettings, VideoLookupResponse } from '../src/types/video'
import { ClipService } from './services/clip.service'
import { FileManagerService } from './services/file-manager.service'
import { HistoryService } from './services/history.service'
import { isTrustedRenderer as isTrustedSender } from './services/ipc-guard.service'
import { isAllowedNavigation } from './services/navigation-policy.service'
import { SettingsService } from './services/settings.service'
import { collectSystemStatus } from './services/system-status.service'
import { inspectUpdateProviderConfiguration, UpdateService } from './services/update.service'
import type { UpdateProviderPort } from './services/update.service'
import { registerUpdateIpc } from './services/update-ipc.service'
import { queryVideo } from './services/youtube.service'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appEntryUrl = pathToFileURL(path.join(__dirname, '../dist/index.html')).href
const require = createRequire(import.meta.url)
// Electron exposes its main-process API as a CommonJS object. createRequire
// keeps that access reliable while the Vite plugin emits this entry as ESM.
const electronApi = require('electron') as typeof import('electron')
const devServerUrl = process.env.VITE_DEV_SERVER_URL
let mainWindow: BrowserWindow | null = null
let quitting = false
let activeClipService: ClipService | null = null
let settingsService: SettingsService | null = null
let historyService: HistoryService | null = null
let fileManagerService: FileManagerService | null = null
let updateService: UpdateService | null = null

function isTrustedRenderer(sender: Electron.WebContents, senderFrame: Electron.WebFrameMain | null): boolean {
  return isTrustedSender(
    mainWindow?.webContents,
    sender,
    mainWindow?.isDestroyed() ?? true,
    senderFrame,
    mainWindow?.webContents.mainFrame,
  )
}

function createWindow(): void {
  const win = new electronApi.BrowserWindow({
    title: 'LIVE CUTTER',
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    center: true,
    show: false,
    backgroundColor: '#111214',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const frameNavigationEvents = win.webContents as unknown as {
    on(event: 'will-frame-navigate', listener: (event: Electron.Event, details: { url: string; isMainFrame: boolean }) => void): void
  }
  frameNavigationEvents.on('will-frame-navigate', (event, details) => {
    if (!isAllowedNavigation(details.url, appEntryUrl, devServerUrl, details.isMainFrame)) event.preventDefault()
  })

  if (devServerUrl) void win.loadURL(devServerUrl)
  else void win.loadFile(path.join(__dirname, '../dist/index.html'))
}

function getYtDlpExecutable(): string | null {
  if (electronApi.app.isPackaged) {
    const bundledExecutable = path.join(process.resourcesPath, 'yt-dlp', 'yt-dlp.exe')
    return existsSync(bundledExecutable) ? bundledExecutable : null
  }
  const projectExecutable = path.join(electronApi.app.getAppPath(), 'vendor', 'yt-dlp', 'yt-dlp.exe')
  if (existsSync(projectExecutable)) return projectExecutable
  // Optional developer installation from PATH; the Renderer cannot choose a path.
  return 'yt-dlp'
}

function configureClipService(): void {
  const appPath = electronApi.app.getAppPath()
  const resourcesPath = process.resourcesPath
  const getBundledOrPath = (fileName: string): string | null => {
    const bundled = electronApi.app.isPackaged
      ? path.join(resourcesPath, 'ffmpeg', fileName)
      : path.join(appPath, 'vendor', 'ffmpeg', fileName)
    if (existsSync(bundled)) return bundled
    return electronApi.app.isPackaged ? null : fileName.replace(/\.exe$/i, '')
  }
  const ffmpeg = getBundledOrPath('ffmpeg.exe')
  const ffprobe = getBundledOrPath('ffprobe.exe')
  const ffmpegDirectory = ffmpeg && path.isAbsolute(ffmpeg) ? path.dirname(ffmpeg) : null
  settingsService = new SettingsService(
    electronApi.app.getPath('userData'),
    path.join(electronApi.app.getPath('videos'), 'LIVE CUTTER'),
  )
  historyService = new HistoryService(electronApi.app.getPath('userData'))
  fileManagerService = new FileManagerService(electronApi.shell)
  const service = new ClipService({
    ytDlp: getYtDlpExecutable(), ffmpeg, ffprobe, ffmpegDirectory,
    videosDirectory: electronApi.app.getPath('videos'),
    temporaryDirectory: electronApi.app.getPath('temp'),
    loadSettings: () => settingsService!.get(),
    recordHistory: (entry) => historyService!.add(entry),
  })
  activeClipService = service
}

function configureUpdateService(): void {
  const appUpdateConfigPath = path.join(process.resourcesPath, 'app-update.yml')
  const appUpdateConfig = electronApi.app.isPackaged && existsSync(appUpdateConfigPath)
    ? readFileSync(appUpdateConfigPath, 'utf8')
    : null
  const updaterPackage = require('electron-updater') as { autoUpdater: unknown }
  updateService = new UpdateService({
    updater: updaterPackage.autoUpdater as UpdateProviderPort,
    configuration: inspectUpdateProviderConfiguration({
      isPackaged: electronApi.app.isPackaged,
      platform: process.platform,
      appUpdateConfig,
    }),
    currentVersion: electronApi.app.getVersion(),
    platform: process.platform,
    isProcessing: () => activeClipService?.isBusy ?? false,
  })
  updateService.subscribe((state) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('updates:state', state)
  })
}

electronApi.ipcMain.handle('youtube:fetch-video', async (event, rawUrl: unknown): Promise<VideoLookupResponse> => {
  if (!isTrustedRenderer(event.sender, event.senderFrame)) {
    return { ok: false, error: { code: 'PROCESS', message: 'This window cannot request video information.' } }
  }
  if (typeof rawUrl !== 'string' || rawUrl.length > 2_048) {
    return { ok: false, error: { code: 'INVALID_URL', message: 'Enter a valid HTTPS YouTube video URL.' } }
  }
  const executable = getYtDlpExecutable()
  if (!executable) {
    return { ok: false, error: { code: 'YTDLP_NOT_FOUND', message: 'yt-dlp is missing from the application resources. Rebuild the package with yt-dlp included.' } }
  }
  return queryVideo(executable, rawUrl)
})

electronApi.ipcMain.handle('clip:start', (event, request: unknown): ClipStartResponse => {
  if (!isTrustedRenderer(event.sender, event.senderFrame) || !activeClipService) return { ok: false, message: 'This window cannot start a clip.' }
  return activeClipService.start(request, (progress: ClipProgressEvent) => {
    updateService?.refreshProcessingStatus()
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('clip:progress', progress)
  })
})

electronApi.ipcMain.handle('clip:cancel', (event, jobId: unknown): boolean => {
  if (!isTrustedRenderer(event.sender, event.senderFrame) || !activeClipService) return false
  return activeClipService.cancel(jobId)
})

registerUpdateIpc(electronApi.ipcMain, {
  getState: () => updateService!.getState(),
  checkForUpdates: () => updateService!.checkForUpdates(),
  downloadUpdate: () => updateService!.downloadUpdate(),
  cancelDownload: () => updateService!.cancelDownload(),
  installUpdate: () => updateService!.installUpdate(),
}, (event) => isTrustedRenderer(event.sender as Electron.WebContents, event.senderFrame as Electron.WebFrameMain | null))

electronApi.ipcMain.handle('clip:open-result', async (event, jobId: unknown, mode: unknown): Promise<string | null> => {
  if (!isTrustedRenderer(event.sender, event.senderFrame) || !activeClipService) return 'This window cannot open the clip.'
  return activeClipService.openResult(jobId, mode)
})

electronApi.ipcMain.handle('settings:get', async (event): Promise<UserSettings | null> => {
  if (!isTrustedRenderer(event.sender, event.senderFrame) || !settingsService) return null
  return settingsService.get()
})

electronApi.ipcMain.handle('system:status', async (event) => {
  if (!isTrustedRenderer(event.sender, event.senderFrame) || !settingsService) return null
  const settings = await settingsService.get()
  return collectSystemStatus({
    appVersion: electronApi.app.getVersion(),
    ytDlp: getYtDlpExecutable(),
    ffmpeg: electronApi.app.isPackaged
      ? path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
      : path.join(electronApi.app.getAppPath(), 'vendor', 'ffmpeg', 'ffmpeg.exe'),
    ffprobe: electronApi.app.isPackaged
      ? path.join(process.resourcesPath, 'ffmpeg', 'ffprobe.exe')
      : path.join(electronApi.app.getAppPath(), 'vendor', 'ffmpeg', 'ffprobe.exe'),
    outputDirectory: settings.outputDirectory,
  })
})

electronApi.ipcMain.handle('settings:select-output', async (event): Promise<UserSettings | null> => {
  if (!isTrustedRenderer(event.sender, event.senderFrame) || !settingsService || !mainWindow) return null
  const current = await settingsService.get()
  const result = await electronApi.dialog.showOpenDialog(mainWindow, {
    title: 'Choose output folder', defaultPath: current.outputDirectory, properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return settingsService.setOutputDirectory(result.filePaths[0])
})

electronApi.ipcMain.handle('settings:restore-output', async (event): Promise<UserSettings | null> => {
  if (!isTrustedRenderer(event.sender, event.senderFrame) || !settingsService) return null
  return settingsService.restoreOutputDirectory()
})

electronApi.ipcMain.handle('settings:set-quality', async (event, quality: unknown): Promise<UserSettings | null> => {
  if (!isTrustedRenderer(event.sender, event.senderFrame) || !settingsService) return null
  return settingsService.updateQuality(quality)
})

electronApi.ipcMain.handle('settings:set-naming', async (event, pattern: unknown): Promise<UserSettings | null> => {
  if (!isTrustedRenderer(event.sender, event.senderFrame) || !settingsService) return null
  return settingsService.updateFileNamingPattern(pattern)
})

electronApi.ipcMain.handle('settings:open-output', async (event): Promise<string | null> => {
  if (!isTrustedRenderer(event.sender, event.senderFrame) || !settingsService || !fileManagerService) return 'This window cannot open the output folder.'
  const outputDirectory = await settingsService.ensureOutputDirectory()
  return fileManagerService.openDirectory(outputDirectory)
})

electronApi.ipcMain.handle('history:list', async (event): Promise<ClipHistoryEntry[] | null> => {
  if (!isTrustedRenderer(event.sender, event.senderFrame) || !historyService) return null
  return historyService.list()
})

electronApi.ipcMain.handle('history:remove', async (event, id: unknown): Promise<boolean> => {
  if (!isTrustedRenderer(event.sender, event.senderFrame) || !historyService) return false
  return historyService.remove(id)
})

electronApi.ipcMain.handle('history:clear', async (event): Promise<boolean> => {
  if (!isTrustedRenderer(event.sender, event.senderFrame) || !historyService) return false
  await historyService.clear()
  return true
})

electronApi.ipcMain.handle('history:open', async (event, id: unknown, mode: unknown): Promise<string | null> => {
  if (!isTrustedRenderer(event.sender, event.senderFrame) || !historyService || !fileManagerService) return 'This window cannot open history files.'
  const entry = await historyService.get(id)
  return entry ? fileManagerService.openHistoryEntry(entry, mode) : 'The selected history record is unavailable.'
})

void electronApi.app.whenReady().then(() => {
  configureClipService()
  configureUpdateService()
  createWindow()
  electronApi.app.on('activate', () => {
    if (electronApi.BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

electronApi.app.on('before-quit', (event) => {
  if (quitting) return
  if (!activeClipService?.isBusy) return
  event.preventDefault()
  quitting = true
  void activeClipService.cancelAndWait().finally(() => electronApi.app.quit())
})

electronApi.app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') electronApi.app.quit()
})
