import path from 'node:path'
import type { ClipHistoryEntry, OutputQuality } from '../../src/types/video.ts'
import { enqueue, readJsonFile, writeJsonAtomically } from './json-file.service.ts'

const MAX_HISTORY_ENTRIES = 500

export class HistoryService {
  private readonly filePath: string
  private queue: Promise<void> = Promise.resolve()

  constructor(userDataDirectory: string) {
    this.filePath = path.join(userDataDirectory, 'clip-history.json')
  }

  async list(): Promise<ClipHistoryEntry[]> {
    await this.queue
    return readEntries(await readJsonFile(this.filePath))
  }

  async get(id: unknown): Promise<ClipHistoryEntry | null> {
    if (typeof id !== 'string') return null
    return (await this.list()).find((entry) => entry.id === id) ?? null
  }

  async add(entry: ClipHistoryEntry): Promise<void> {
    if (!validateEntry(entry)) throw new Error('The history entry is invalid.')
    return this.mutate(async (entries) => [entry, ...entries.filter((item) => item.id !== entry.id)].slice(0, MAX_HISTORY_ENTRIES))
  }

  async remove(id: unknown): Promise<boolean> {
    if (typeof id !== 'string') return false
    let removed = false
    await this.mutate(async (entries) => {
      const next = entries.filter((entry) => entry.id !== id)
      removed = next.length !== entries.length
      return next
    })
    return removed
  }

  async clear(): Promise<void> {
    await this.mutate(async () => [])
  }

  private async mutate(transform: (entries: ClipHistoryEntry[]) => Promise<ClipHistoryEntry[]>): Promise<void> {
    const { result, next } = enqueue(this.queue, async () => {
      const updated = await transform(readEntries(await readJsonFile(this.filePath)))
      await writeJsonAtomically(this.filePath, updated)
    })
    this.queue = next
    await result
  }
}

function readEntries(value: unknown): ClipHistoryEntry[] {
  if (!Array.isArray(value)) return []
  return value.map(validateEntry).filter((entry): entry is ClipHistoryEntry => entry !== null).slice(0, MAX_HISTORY_ENTRIES)
}

function validateEntry(value: unknown): ClipHistoryEntry | null {
  if (typeof value !== 'object' || value === null) return null
  const item = value as Record<string, unknown>
  if (typeof item.id !== 'string' || item.id.length < 1 || item.id.length > 100) return null
  if (typeof item.title !== 'string' || item.title.length > 500 || typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt))) return null
  if (typeof item.start !== 'string' || typeof item.end !== 'string') return null
  if (item.status !== 'completed' && item.status !== 'cancelled' && item.status !== 'error') return null
  if (item.quality !== 'original' && item.quality !== 'compatibility') return null
  if (item.fileName !== null && (typeof item.fileName !== 'string' || path.basename(item.fileName) !== item.fileName || path.extname(item.fileName).toLowerCase() !== '.mp4')) return null
  if (item.outputDirectory !== null && (typeof item.outputDirectory !== 'string' || !path.isAbsolute(item.outputDirectory))) return null
  if (item.status === 'completed' && (item.fileName === null || item.outputDirectory === null)) return null
  const nullableNumber = (input: unknown) => input === null ? null : typeof input === 'number' && Number.isFinite(input) && input >= 0 ? input : undefined
  const durationSeconds = nullableNumber(item.durationSeconds)
  const width = nullableNumber(item.width)
  const height = nullableNumber(item.height)
  const fileSizeBytes = nullableNumber(item.fileSizeBytes)
  if ([durationSeconds, width, height, fileSizeBytes].includes(undefined)) return null
  if (item.status === 'completed' && (!durationSeconds || !width || !height || !fileSizeBytes)) return null
  if (item.message !== null && (typeof item.message !== 'string' || item.message.length > 1_000)) return null
  return {
    id: item.id,
    fileName: item.fileName as string | null,
    outputDirectory: item.outputDirectory as string | null,
    title: item.title,
    createdAt: item.createdAt,
    start: item.start,
    end: item.end,
    durationSeconds: durationSeconds as number | null,
    width: width as number | null,
    height: height as number | null,
    fileSizeBytes: fileSizeBytes as number | null,
    status: item.status,
    quality: item.quality as OutputQuality,
    message: item.message as string | null,
  }
}
