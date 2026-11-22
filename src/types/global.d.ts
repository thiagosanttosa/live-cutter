// Descreve a API que o preload expõe em `window.liveCutter`
// (ver electron/preload.ts). Mantenha os dois arquivos em sincronia.
export {}
import type { AppUpdateState, ClipHistoryEntry, ClipProgressEvent, ClipRequest, ClipStartResponse, OutputQuality, SystemStatus, UserSettings, VideoLookupResponse } from './video'

declare global {
  interface Window {
    liveCutter: {
      readonly platform: string
      checkVideo(url: string): Promise<VideoLookupResponse>
      startClip(request: ClipRequest): Promise<ClipStartResponse>
      cancelClip(jobId: string): Promise<boolean>
      openClip(jobId: string, mode: 'file' | 'folder'): Promise<string | null>
      onClipProgress(callback: (progress: ClipProgressEvent) => void): () => void
      getSettings(): Promise<UserSettings | null>
      getSystemStatus(): Promise<SystemStatus | null>
      chooseOutputDirectory(): Promise<UserSettings | null>
      restoreOutputDirectory(): Promise<UserSettings | null>
      setOutputQuality(quality: OutputQuality): Promise<UserSettings | null>
      setFileNamingPattern(pattern: string): Promise<UserSettings | null>
      openOutputDirectory(): Promise<string | null>
      listClipHistory(): Promise<ClipHistoryEntry[] | null>
      removeClipHistoryEntry(id: string): Promise<boolean>
      clearClipHistory(): Promise<boolean>
      openHistoryEntry(id: string, mode: 'file' | 'folder'): Promise<string | null>
      getAppUpdateState(): Promise<AppUpdateState | null>
      checkForAppUpdates(): Promise<AppUpdateState | null>
      downloadAppUpdate(): Promise<AppUpdateState | null>
      cancelAppUpdateDownload(): Promise<AppUpdateState | null>
      installAppUpdate(): Promise<AppUpdateState | null>
      onAppUpdateState(callback: (state: AppUpdateState) => void): () => void
    }
  }
}
