import type { AppUpdateState } from '../../src/types/video.ts'
interface UpdateServicePort {
  getState(): AppUpdateState
  checkForUpdates(): Promise<AppUpdateState>
  downloadUpdate(): Promise<AppUpdateState>
  cancelDownload(): AppUpdateState
  installUpdate(): AppUpdateState
}

interface InvokeEvent { sender: unknown; senderFrame: unknown }
interface IpcMainPort { handle(channel: string, listener: (event: InvokeEvent) => unknown): void }

export function registerUpdateIpc(
  ipcMain: IpcMainPort,
  updates: UpdateServicePort,
  isTrustedRenderer: (event: InvokeEvent) => boolean,
): void {
  const register = (channel: string, operation: () => AppUpdateState | Promise<AppUpdateState>) => {
    ipcMain.handle(channel, (event) => isTrustedRenderer(event) ? operation() : null)
  }
  register('updates:get-state', () => updates.getState())
  register('updates:check', () => updates.checkForUpdates())
  register('updates:download', () => updates.downloadUpdate())
  register('updates:cancel-download', () => updates.cancelDownload())
  register('updates:install', () => updates.installUpdate())
}
