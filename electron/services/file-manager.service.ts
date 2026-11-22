import { lstat, stat } from 'node:fs/promises'
import path from 'node:path'
import type { ClipHistoryEntry } from '../../src/types/video.ts'

export interface ShellOperations {
  openPath(path: string): Promise<string>
  showItemInFolder(path: string): void
}

export class FileManagerService {
  private readonly shell: ShellOperations

  constructor(shell: ShellOperations) { this.shell = shell }

  async openDirectory(directory: string): Promise<string | null> {
    if (!path.isAbsolute(directory)) return 'The output folder path is invalid.'
    try {
      if (!(await stat(directory)).isDirectory()) return 'The output path is not a folder.'
      return await this.shell.openPath(path.resolve(directory)) || null
    } catch {
      return 'The output folder is unavailable.'
    }
  }

  async openHistoryEntry(entry: ClipHistoryEntry, mode: unknown): Promise<string | null> {
    if (entry.status !== 'completed' || !entry.fileName || !entry.outputDirectory) return 'This history item has no completed file.'
    if (mode !== 'file' && mode !== 'folder') return 'Choose a valid file action.'
    const directory = path.resolve(entry.outputDirectory)
    if (!path.isAbsolute(entry.outputDirectory) || path.basename(entry.fileName) !== entry.fileName
      || path.extname(entry.fileName).toLowerCase() !== '.mp4') return 'This history file path is invalid.'
    const filePath = path.resolve(directory, entry.fileName)
    if (path.dirname(filePath) !== directory) return 'This history file path is invalid.'
    try {
      if (!(await lstat(filePath)).isFile()) return 'The clip file is unavailable.'
      if (mode === 'folder') {
        this.shell.showItemInFolder(filePath)
        return null
      }
      return await this.shell.openPath(filePath) || null
    } catch {
      return 'The clip file is unavailable.'
    }
  }
}
