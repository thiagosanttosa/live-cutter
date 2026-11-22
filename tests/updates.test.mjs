import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { UpdateService, inspectUpdateProviderConfiguration } from '../electron/services/update.service.ts'
import { registerUpdateIpc } from '../electron/services/update-ipc.service.ts'
import { compareSemanticVersions, isSemanticVersion } from '../src/utils/semver.ts'
import { requestInstallConfirmation } from '../src/utils/update-confirmation.ts'

class FakeCancellationToken extends EventEmitter {
  cancelled = false
  cancel() { this.cancelled = true; this.emit('cancel') }
}

class FakeUpdater extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = true
  allowPrerelease = true
  result
  downloaded = false
  cancellationToken = new FakeCancellationToken()
  installCalls = []
  holdDownload = false

  constructor(result) { super(); this.result = result }
  async checkForUpdates() {
    this.emit('checking-for-update')
    if (this.result instanceof Error) throw this.result
    this.cancellationToken = new FakeCancellationToken()
    return { ...this.result, cancellationToken: this.cancellationToken }
  }
  async downloadUpdate(token) {
    this.downloaded = true
    assert.equal(token, this.cancellationToken)
    this.emit('download-progress', { percent: 42.5, transferred: 425, total: 1000 })
    await Promise.resolve()
    if (this.holdDownload) {
      return new Promise((resolve, reject) => {
        const cancelled = () => {
          this.emit('update-cancelled', this.result.updateInfo)
          reject(new Error('cancelled'))
        }
        if (token.cancelled) cancelled()
        else token.once('cancel', cancelled)
      })
    }
    this.emit('update-downloaded', this.result.updateInfo)
    return ['installer.exe']
  }
  quitAndInstall(...args) { this.installCalls.push(args) }
}

const latestInfo = {
  version: '0.2.0',
  releaseName: 'Clip management improvements',
  releaseDate: '2026-11-22T12:00:00.000Z',
  releaseNotes: 'Faster clip review.\nSafer update flow.',
  files: [{ url: 'LIVE-CUTTER-Setup-0.2.0-x64.exe', size: 245760 }],
}
const configured = { configured: true, message: 'Secure GitHub Releases updates are configured.' }

test('semantic version validation and ordering follow SemVer precedence', () => {
  assert.equal(isSemanticVersion('1.2.3'), true)
  assert.equal(isSemanticVersion('1.2.3-rc.2+build.4'), true)
  assert.equal(isSemanticVersion('01.2.3'), false)
  assert.equal(isSemanticVersion('1.2.3-01'), false)
  assert.equal(compareSemanticVersions('1.0.0-alpha.2', '1.0.0-alpha.10'), -1)
  assert.equal(compareSemanticVersions('1.0.0-rc.1', '1.0.0'), -1)
  assert.equal(compareSemanticVersions('1.0.0+one', '1.0.0+two'), 0)
  assert.equal(compareSemanticVersions('1.1.0', '1.0.9'), 1)
  assert.throws(() => compareSemanticVersions('latest', '1.0.0'), /valid Semantic Versioning/)
})

test('update source stays disabled until a packaged, signed GitHub provider exists', () => {
  assert.equal(inspectUpdateProviderConfiguration({ isPackaged: false, platform: 'win32', appUpdateConfig: null }).configured, false)
  assert.equal(inspectUpdateProviderConfiguration({ isPackaged: true, platform: 'win32', appUpdateConfig: null }).configured, false)
  const github = 'provider: github\nowner: live-cutter-owner\nrepo: live-cutter\npublisherName: CN=LIVE CUTTER'
  assert.equal(inspectUpdateProviderConfiguration({ isPackaged: true, platform: 'win32', appUpdateConfig: github }).configured, true)
  const unsigned = `${github}\nverifyUpdateCodeSignature: false`
  const insecure = inspectUpdateProviderConfiguration({ isPackaged: true, platform: 'win32', appUpdateConfig: unsigned })
  assert.equal(insecure.configured, false)
  assert.match(insecure.message, /signature verification/)
  assert.equal(inspectUpdateProviderConfiguration({ isPackaged: true, platform: 'darwin', appUpdateConfig: github }).configured, false)
})

test('manual check reports current version and up-to-date state without auto-downloading', async () => {
  const updater = new FakeUpdater({ isUpdateAvailable: false, updateInfo: { ...latestInfo, version: '0.1.0' } })
  const service = new UpdateService({ updater, configuration: configured, currentVersion: '0.1.0', platform: 'win32', isProcessing: () => false })
  const state = await service.checkForUpdates()
  assert.equal(updater.autoDownload, false)
  assert.equal(updater.autoInstallOnAppQuit, false)
  assert.equal(state.currentVersion, '0.1.0')
  assert.equal(state.status, 'up-to-date')
  assert.equal(state.canCheck, true)
  assert.equal(updater.downloaded, false)
})

test('available updates expose notes and size, then report verified download progress and ready state', async () => {
  const updater = new FakeUpdater({ isUpdateAvailable: true, updateInfo: latestInfo })
  const service = new UpdateService({ updater, configuration: configured, currentVersion: '0.1.0', platform: 'win32', isProcessing: () => false })
  const available = await service.checkForUpdates()
  assert.equal(available.status, 'available')
  assert.equal(available.latestVersion, '0.2.0')
  assert.equal(available.releaseNotes, latestInfo.releaseNotes)
  assert.equal(available.downloadSizeBytes, 245760)
  assert.equal(available.canDownload, true)
  assert.equal(updater.downloaded, false)

  const promise = service.downloadUpdate()
  assert.equal(service.getState().status, 'downloading')
  const ready = await promise
  assert.equal(ready.status, 'ready-to-install')
  assert.equal(ready.percent, 100)
  assert.equal(ready.canInstall, true)
})

test('update errors are shown as errors and development never reports a false up-to-date state', async () => {
  const failedUpdater = new FakeUpdater(new Error('offline'))
  const failed = new UpdateService({ updater: failedUpdater, configuration: configured, currentVersion: '0.1.0', platform: 'win32', isProcessing: () => false })
  assert.equal((await failed.checkForUpdates()).status, 'error')
  const disabled = new UpdateService({ updater: new FakeUpdater({}), configuration: { configured: false, message: 'Development updater is disabled.' }, currentVersion: '0.1.0', platform: 'win32', isProcessing: () => false })
  assert.equal((await disabled.checkForUpdates()).status, 'not-configured')
})

test('downloads can be cancelled and a clip in progress blocks installation', async () => {
  const updater = new FakeUpdater({ isUpdateAvailable: true, updateInfo: latestInfo })
  updater.holdDownload = true
  let processing = false
  const service = new UpdateService({ updater, configuration: configured, currentVersion: '0.1.0', platform: 'win32', isProcessing: () => processing })
  await service.checkForUpdates()
  const pending = service.downloadUpdate()
  assert.equal(service.getState().status, 'downloading')
  const cancelled = service.cancelDownload()
  assert.equal(updater.cancellationToken.cancelled, true)
  assert.equal(cancelled.canCancel, false)
  await pending

  const availableUpdater = new FakeUpdater({ isUpdateAvailable: true, updateInfo: latestInfo })
  const installService = new UpdateService({ updater: availableUpdater, configuration: configured, currentVersion: '0.1.0', platform: 'win32', isProcessing: () => processing })
  await installService.checkForUpdates()
  await installService.downloadUpdate()
  processing = true
  const blocked = installService.installUpdate()
  assert.equal(blocked.canInstall, false)
  assert.match(blocked.message, /clip is still being processed/i)
  assert.equal(availableUpdater.installCalls.length, 0)
  processing = false
  assert.equal(installService.installUpdate().status, 'installing')
  assert.deepEqual(availableUpdater.installCalls, [[false, true]])
})

test('installation requires an explicit positive confirmation', () => {
  let installs = 0
  const rejected = requestInstallConfirmation('0.2.0', () => false)
  if (rejected) installs += 1
  const accepted = requestInstallConfirmation('0.2.0', (message) => message.includes('0.2.0'))
  if (accepted) installs += 1
  assert.equal(installs, 1)
})

test('update IPC accepts only the trusted renderer and accepts no renderer-supplied URL', async () => {
  const handlers = new Map()
  const ipc = { handle: (channel, handler) => handlers.set(channel, handler) }
  const calls = []
  const state = { currentVersion: '0.1.0', platform: 'win32', status: 'idle', latestVersion: null, releaseName: null, releaseNotes: null, releaseDate: null, downloadSizeBytes: null, percent: null, transferredBytes: null, totalBytes: null, isProcessingClip: false, canCheck: true, canDownload: false, canCancel: false, canInstall: false, message: 'Ready.' }
  const service = {
    getState: () => state,
    checkForUpdates: async () => { calls.push('check'); return state },
    downloadUpdate: async () => { calls.push('download'); return state },
    cancelDownload: () => { calls.push('cancel'); return state },
    installUpdate: () => { calls.push('install'); return state },
  }
  registerUpdateIpc(ipc, service, (event) => event.sender === 'trusted-window' && event.senderFrame === 'main-frame')
  const rejected = await handlers.get('updates:check')({ sender: 'untrusted-window', senderFrame: 'main-frame' }, 'https://attacker.invalid')
  assert.equal(rejected, null)
  assert.deepEqual(calls, [])
  const childFrame = await handlers.get('updates:check')({ sender: 'trusted-window', senderFrame: 'child-frame' }, 'https://attacker.invalid')
  assert.equal(childFrame, null)
  const accepted = await handlers.get('updates:check')({ sender: 'trusted-window', senderFrame: 'main-frame' }, 'https://attacker.invalid')
  assert.equal(accepted, state)
  assert.deepEqual(calls, ['check'])
  assert.equal(handlers.has('updates:install'), true)
})
