import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { HistoryService } from '../electron/services/history.service.ts'
import { SettingsService } from '../electron/services/settings.service.ts'
import { FileManagerService } from '../electron/services/file-manager.service.ts'
import { isTrustedRenderer } from '../electron/services/ipc-guard.service.ts'
import { buildOutputFileName, makeFileNamePreview } from '../src/utils/naming.ts'

describe('persistent application settings', () => {
  it('stores preferences atomically and restores them after creating a new service instance', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'live-cutter-settings-test-'))
    try {
      const chosen = path.join(root, 'chosen')
      await mkdir(chosen)
      const settings = new SettingsService(path.join(root, 'user-data'), path.join(root, 'Videos', 'LIVE CUTTER'))
      assert.equal((await settings.get()).quality, 'original')
      await settings.setOutputDirectory(chosen)
      await settings.updateFileNamingPattern('{title}_{date}')
      await settings.updateQuality('compatibility')
      await settings.restoreOutputDirectory()
      assert.equal(await settings.ensureOutputDirectory(), path.join(root, 'Videos', 'LIVE CUTTER'))
      await settings.setOutputDirectory(chosen)

      const recovered = await new SettingsService(path.join(root, 'user-data'), path.join(root, 'Videos', 'LIVE CUTTER')).get()
      assert.deepEqual(recovered, { outputDirectory: chosen, fileNamingPattern: '{title}_{date}', quality: 'compatibility' })
      assert.ok((await readFile(path.join(root, 'user-data', 'settings.json'), 'utf8')).includes('compatibility'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects non-directory paths, non-absolute paths, invalid quality and unknown naming tokens', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'live-cutter-settings-test-'))
    const filePath = path.join(root, 'file.txt')
    await writeFile(filePath, 'test')
    const settings = new SettingsService(root, path.join(root, 'Videos'))
    try {
      await assert.rejects(settings.setOutputDirectory(filePath), /not a folder/)
      await assert.rejects(settings.setOutputDirectory('relative-output'), /absolute/)
      await assert.rejects(settings.updateQuality('ultra'), /supported output quality/)
      await assert.rejects(settings.updateFileNamingPattern('{title}_{path}'), /Unsupported naming variable/)
      await assert.rejects(settings.updateFileNamingPattern('   '), /1 to 160/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('replaces malformed persisted settings with validated defaults', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'live-cutter-settings-test-'))
    const userData = path.join(root, 'user-data')
    const defaultOutput = path.join(root, 'Videos', 'LIVE CUTTER')
    try {
      await mkdir(userData, { recursive: true })
      await writeFile(path.join(userData, 'settings.json'), JSON.stringify({ outputDirectory: 'relative', quality: 'ultra', fileNamingPattern: '{unknown}' }))
      const settings = new SettingsService(userData, defaultOutput)
      assert.deepEqual(await settings.get(), {
        outputDirectory: defaultOutput,
        fileNamingPattern: '{title}_{start}_{end}',
        quality: 'original',
      })
      assert.ok((await readFile(path.join(userData, 'settings.json'), 'utf8')).includes('original'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('persistent clip history', () => {
  const entry = {
    id: 'job-1', fileName: 'Sample_00-00-00_00-00-30.mp4', outputDirectory: 'C:\\Videos\\LIVE CUTTER',
    title: 'Sample', createdAt: '2026-11-21T12:00:00.000Z', start: '00:00:00', end: '00:00:30',
    durationSeconds: 30, width: 1920, height: 1080, fileSizeBytes: 1234,
    status: 'completed', quality: 'original', message: null,
  }

  it('persists records across instances and removes only the record', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'live-cutter-history-test-'))
    try {
      const mediaDirectory = path.join(root, 'media')
      await mkdir(mediaDirectory)
      const mediaPath = path.join(mediaDirectory, entry.fileName)
      await writeFile(mediaPath, 'media')
      const history = new HistoryService(root)
      const savedEntry = { ...entry, outputDirectory: mediaDirectory }
      await history.add(savedEntry)
      assert.deepEqual(await new HistoryService(root).list(), [savedEntry])
      assert.equal(await history.remove('job-1'), true)
      assert.deepEqual(await history.list(), [])
      assert.equal(await readFile(mediaPath, 'utf8'), 'media')
      assert.equal(await history.remove('job-1'), false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('filters malformed history data and clears all records without deleting media', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'live-cutter-history-test-'))
    try {
      const history = new HistoryService(root)
      const mediaDirectory = path.join(root, 'media')
      await mkdir(mediaDirectory, { recursive: true })
      await history.add({ ...entry, outputDirectory: mediaDirectory })
      const mediaPath = path.join(mediaDirectory, entry.fileName)
      await writeFile(mediaPath, 'media remains')
      assert.equal(await history.clear(), undefined)
      assert.deepEqual(await history.list(), [])
      assert.equal(await readFile(mediaPath, 'utf8'), 'media remains')
      await writeFile(path.join(root, 'clip-history.json'), '{invalid')
      assert.deepEqual(await history.list(), [])
      await writeFile(path.join(root, 'clip-history.json'), JSON.stringify([entry, { ...entry, status: 'working' }]))
      assert.deepEqual(await history.list(), [entry])
      await assert.rejects(history.add({ ...entry, status: 'completed', fileName: null }), /invalid/)
      await assert.rejects(history.add({ ...entry, width: null }), /invalid/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('safe file management and IPC sender checks', () => {
  it('opens only a validated completed MP4 selected by a history record', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'live-cutter-file-open-test-'))
    const directory = path.join(root, 'output')
    await mkdir(directory)
    const fileName = 'clip.mp4'
    const filePath = path.join(directory, fileName)
    await writeFile(filePath, 'file')
    const opened = []
    const shown = []
    const fileManager = new FileManagerService({
      openPath: async (value) => { opened.push(value); return '' },
      showItemInFolder: (value) => shown.push(value),
    })
    const record = {
      id: 'job-open', fileName, outputDirectory: directory, title: 'Clip', createdAt: '2026-11-21T12:00:00.000Z',
      start: '00:00:00', end: '00:00:30', durationSeconds: 30, width: 1920, height: 1080, fileSizeBytes: 4,
      status: 'completed', quality: 'original', message: null,
    }
    try {
      assert.equal(await fileManager.openHistoryEntry(record, 'file'), null)
      assert.equal(await fileManager.openHistoryEntry(record, 'folder'), null)
      assert.equal(await fileManager.openDirectory(directory), null)
      assert.match(await fileManager.openDirectory('relative-folder'), /invalid/)
      assert.deepEqual(opened, [filePath, directory])
      assert.deepEqual(shown, [filePath])
      assert.match(await fileManager.openHistoryEntry({ ...record, fileName: '..\\outside.mp4' }, 'file'), /invalid/)
      assert.match(await fileManager.openHistoryEntry({ ...record, status: 'error' }, 'file'), /no completed file/)
      assert.equal(await fileManager.openHistoryEntry(record, 'download'), 'Choose a valid file action.')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('accepts only the current live window as the IPC caller', () => {
    const currentWindow = {}
    const mainFrame = {}
    assert.equal(isTrustedRenderer(currentWindow, currentWindow, false, mainFrame, mainFrame), true)
    assert.equal(isTrustedRenderer(currentWindow, {}, false, mainFrame, mainFrame), false)
    assert.equal(isTrustedRenderer(currentWindow, currentWindow, true, mainFrame, mainFrame), false)
    assert.equal(isTrustedRenderer(currentWindow, currentWindow, false, {}, mainFrame), false)
    assert.equal(isTrustedRenderer(null, null, false, mainFrame, mainFrame), false)
  })
})

describe('file naming templates', () => {
  it('substitutes supported variables and produces a safe MP4 preview', () => {
    assert.equal(buildOutputFileName('{title}_{start}_{end}', {
      title: 'GTA VI: Live', start: '02:15:30', end: '02:18:45', date: '2026-11-21',
    }), 'GTA_VI_Live_02-15-30_02-18-45.mp4')
    assert.equal(buildOutputFileName('{title}_{date}', {
      title: 'CON', start: '00:00:00', end: '00:00:30', date: '2026-11-21',
    }), 'CON_2026-11-21.mp4')
    assert.equal(makeFileNamePreview('{title}_{date}', new Date(2026, 10, 21)), 'GTA_VI_Live_2026-11-21.mp4')
    assert.ok(buildOutputFileName('{title}', { title: 'A'.repeat(300), start: '', end: '', date: '' }).length <= 154)
  })
})
