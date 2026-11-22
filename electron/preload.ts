import { contextBridge, ipcRenderer } from 'electron'
import type { AppUpdateState, ClipHistoryEntry, ClipProgressEvent, ClipRequest, ClipStartResponse, OutputQuality, SystemStatus, UserSettings, VideoLookupResponse } from '../src/types/video'

// Only this narrow, typed method crosses the isolated Renderer boundary.
contextBridge.exposeInMainWorld(
  'liveCutter',
  Object.freeze({
    platform: process.platform,
    checkVideo: (url: string): Promise<VideoLookupResponse> => ipcRenderer.invoke('youtube:fetch-video', url),
    startClip: (request: ClipRequest): Promise<ClipStartResponse> => ipcRenderer.invoke('clip:start', request),
    cancelClip: (jobId: string): Promise<boolean> => ipcRenderer.invoke('clip:cancel', jobId),
    openClip: (jobId: string, mode: 'file' | 'folder'): Promise<string | null> => ipcRenderer.invoke('clip:open-result', jobId, mode),
    onClipProgress: (callback: (progress: ClipProgressEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: ClipProgressEvent) => callback(progress)
      ipcRenderer.on('clip:progress', listener)
      return () => ipcRenderer.removeListener('clip:progress', listener)
    },
    getSettings: (): Promise<UserSettings | null> => ipcRenderer.invoke('settings:get'),
    getSystemStatus: (): Promise<SystemStatus | null> => ipcRenderer.invoke('system:status'),
    chooseOutputDirectory: (): Promise<UserSettings | null> => ipcRenderer.invoke('settings:select-output'),
    restoreOutputDirectory: (): Promise<UserSettings | null> => ipcRenderer.invoke('settings:restore-output'),
    setOutputQuality: (quality: OutputQuality): Promise<UserSettings | null> => ipcRenderer.invoke('settings:set-quality', quality),
    setFileNamingPattern: (pattern: string): Promise<UserSettings | null> => ipcRenderer.invoke('settings:set-naming', pattern),
    openOutputDirectory: (): Promise<string | null> => ipcRenderer.invoke('settings:open-output'),
    listClipHistory: (): Promise<ClipHistoryEntry[] | null> => ipcRenderer.invoke('history:list'),
    removeClipHistoryEntry: (id: string): Promise<boolean> => ipcRenderer.invoke('history:remove', id),
    clearClipHistory: (): Promise<boolean> => ipcRenderer.invoke('history:clear'),
    openHistoryEntry: (id: string, mode: 'file' | 'folder'): Promise<string | null> => ipcRenderer.invoke('history:open', id, mode),
    getAppUpdateState: (): Promise<AppUpdateState | null> => ipcRenderer.invoke('updates:get-state'),
    checkForAppUpdates: (): Promise<AppUpdateState | null> => ipcRenderer.invoke('updates:check'),
    downloadAppUpdate: (): Promise<AppUpdateState | null> => ipcRenderer.invoke('updates:download'),
    cancelAppUpdateDownload: (): Promise<AppUpdateState | null> => ipcRenderer.invoke('updates:cancel-download'),
    installAppUpdate: (): Promise<AppUpdateState | null> => ipcRenderer.invoke('updates:install'),
    onAppUpdateState: (callback: (state: AppUpdateState) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: AppUpdateState) => callback(state)
      ipcRenderer.on('updates:state', listener)
      return () => ipcRenderer.removeListener('updates:state', listener)
    },
  }),
)
