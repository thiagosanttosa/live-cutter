import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { OutputQuality, UserSettings } from '../../src/types/video.ts'
import { enqueue, readJsonFile, writeJsonAtomically } from './json-file.service.ts'

export const DEFAULT_FILE_NAMING_PATTERN = '{title}_{start}_{end}'
const MAX_PATTERN_LENGTH = 160
const TOKENS = new Set(['title', 'start', 'end', 'date'])

export class SettingsService {
  private readonly filePath: string
  private readonly defaultOutputDirectory: string
  private queue: Promise<void> = Promise.resolve()

  constructor(userDataDirectory: string, defaultOutputDirectory: string) {
    this.defaultOutputDirectory = defaultOutputDirectory
    this.filePath = path.join(userDataDirectory, 'settings.json')
  }

  async get(): Promise<UserSettings> {
    await this.queue
    const raw = await readJsonFile(this.filePath)
    const settings = validateSettings(raw)
    if (!settings) {
      const defaults = createDefaultSettings(this.defaultOutputDirectory)
      await writeJsonAtomically(this.filePath, defaults)
      return defaults
    }
    return settings
  }

  async setOutputDirectory(outputDirectory: string): Promise<UserSettings> {
    if (!path.isAbsolute(outputDirectory)) throw new Error('Choose an absolute output folder path.')
    const resolved = path.resolve(outputDirectory)
    const folder = await stat(resolved)
    if (!folder.isDirectory()) throw new Error('The selected output path is not a folder.')
    return this.update({ outputDirectory: resolved })
  }

  async restoreOutputDirectory(): Promise<UserSettings> {
    return this.update({ outputDirectory: this.defaultOutputDirectory })
  }

  async ensureOutputDirectory(): Promise<string> {
    const settings = await this.get()
    await mkdir(settings.outputDirectory, { recursive: true })
    return settings.outputDirectory
  }

  async updateQuality(quality: unknown): Promise<UserSettings> {
    if (quality !== 'original' && quality !== 'compatibility') throw new Error('Choose a supported output quality.')
    return this.update({ quality })
  }

  async updateFileNamingPattern(pattern: unknown): Promise<UserSettings> {
    if (typeof pattern !== 'string') throw new Error('Enter a valid file naming pattern.')
    return this.update({ fileNamingPattern: validateFileNamingPattern(pattern) })
  }

  private async update(changes: Partial<UserSettings>): Promise<UserSettings> {
    const { result, next } = enqueue(this.queue, async () => {
      const current = validateSettings(await readJsonFile(this.filePath))
        ?? createDefaultSettings(this.defaultOutputDirectory)
      const updated = { ...current, ...changes }
      await writeJsonAtomically(this.filePath, updated)
      return updated
    })
    this.queue = next
    return result
  }
}

export function createDefaultSettings(outputDirectory: string): UserSettings {
  return { outputDirectory: path.resolve(outputDirectory), fileNamingPattern: DEFAULT_FILE_NAMING_PATTERN, quality: 'original' }
}

export function validateFileNamingPattern(pattern: string): string {
  const clean = pattern.trim()
  if (!clean || clean.length > MAX_PATTERN_LENGTH) throw new Error('The naming pattern must contain 1 to 160 characters.')
  const tokens = [...clean.matchAll(/\{([^{}]*)\}/g)]
  for (const token of tokens) {
    if (!TOKENS.has(token[1].toLowerCase())) throw new Error(`Unsupported naming variable: {${token[1]}}.`)
  }
  const withoutTokens = clean.replace(/\{[^{}]*\}/g, '')
  if (/[{}]/.test(withoutTokens)) throw new Error('Use complete variables such as {title}, {start}, {end} or {date}.')
  return clean
}

export function validateSettings(value: unknown): UserSettings | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (typeof record.outputDirectory !== 'string' || !path.isAbsolute(record.outputDirectory)) return null
  if (typeof record.fileNamingPattern !== 'string' || typeof record.quality !== 'string') return null
  try {
    return {
      outputDirectory: path.resolve(record.outputDirectory),
      fileNamingPattern: validateFileNamingPattern(record.fileNamingPattern),
      quality: record.quality === 'compatibility' ? 'compatibility' : record.quality === 'original' ? 'original' : invalidQuality(),
    }
  } catch {
    return null
  }
}

function invalidQuality(): OutputQuality {
  throw new Error('Invalid output quality')
}
