import { useEffect, useState } from 'react'
import type { AppUpdateState } from '../types/video'
import { requestInstallConfirmation } from '../utils/update-confirmation'

const statusLabel: Record<AppUpdateState['status'], string> = {
  idle: 'IDLE', checking: 'CHECKING', 'up-to-date': 'UP TO DATE', available: 'UPDATE AVAILABLE',
  downloading: 'DOWNLOADING', 'ready-to-install': 'READY TO INSTALL', installing: 'INSTALLING',
  error: 'ERROR', 'not-configured': 'NOT CONFIGURED',
}

function sizeLabel(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return null
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1 }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

export default function AppUpdates() {
  const [state, setState] = useState<AppUpdateState | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let mounted = true
    void window.liveCutter.getAppUpdateState().then((current) => { if (mounted && current) setState(current) })
      .catch(() => { if (mounted) setActionError('Unable to read update status.') })
    const unsubscribe = window.liveCutter.onAppUpdateState((next) => { if (mounted) setState(next) })
    return () => { mounted = false; unsubscribe() }
  }, [])

  async function perform(action: () => Promise<AppUpdateState | null>) {
    setBusy(true)
    setActionError('')
    try {
      const next = await action()
      if (next) setState(next)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The update request failed. Try again later.')
    } finally { setBusy(false) }
  }

  const currentVersion = state?.currentVersion ?? 'Loading…'
  const latestVersion = state?.latestVersion
  return <section className="panel settings-section app-updates" aria-labelledby="about-updates-heading">
    <p className="eyebrow">APPLICATION</p>
    <h2 id="about-updates-heading">ABOUT &amp; UPDATES</h2>
    <p className="settings-copy">LIVE CUTTER desktop application · {state?.platform ?? '…'} · version {currentVersion}</p>
    <div className="app-updates__state" role="status" aria-live="polite">
      <span className={`system-status__dot ${state?.status === 'error' || state?.status === 'not-configured' ? 'system-status__dot--error' : state && ['up-to-date', 'available', 'downloading', 'ready-to-install'].includes(state.status) ? 'system-status__dot--ok' : ''}`} aria-hidden="true" />
      <strong>{statusLabel[state?.status ?? 'idle']}</strong>
      <span>{state?.message ?? 'Loading update information…'}</span>
    </div>
    {state?.status === 'downloading' && <div className="app-updates__progress">
      {state.percent === null ? <div className="progress-track progress-track--indeterminate"><span /></div> : <>
        <div className="progress-track"><span style={{ width: `${state.percent}%` }} /></div>
        <span>{state.percent.toFixed(1)}%{state.totalBytes ? ` · ${sizeLabel(state.transferredBytes)} of ${sizeLabel(state.totalBytes)}` : ''}</span>
      </>}
    </div>}
    {latestVersion && <div className="app-updates__release">
      <div className="app-updates__release-heading">
        <strong>Version {latestVersion}</strong>
        {state?.downloadSizeBytes ? <span>{sizeLabel(state.downloadSizeBytes)}</span> : null}
        {state?.releaseDate ? <span>{new Date(state.releaseDate).toLocaleDateString()}</span> : null}
      </div>
      {state?.releaseName && <p className="settings-copy">{state.releaseName}</p>}
      {state?.releaseNotes && <pre className="app-updates__notes">{state.releaseNotes}</pre>}
    </div>}
    {state?.isProcessingClip && <p className="form-notice form-notice--error" role="status">A clip is being processed. You can check or download an update; installation will wait until the clip finishes.</p>}
    <div className="actions">
      <button className="button button--secondary" type="button" disabled={busy || !state?.canCheck} onClick={() => void perform(() => window.liveCutter.checkForAppUpdates())}>CHECK FOR UPDATES</button>
      {state?.canDownload && <button className="button button--primary" type="button" disabled={busy} onClick={() => void perform(() => window.liveCutter.downloadAppUpdate())}>DOWNLOAD UPDATE</button>}
      {state?.canCancel && <button className="button button--secondary" type="button" disabled={busy} onClick={() => void perform(() => window.liveCutter.cancelAppUpdateDownload())}>CANCEL DOWNLOAD</button>}
      {state?.status === 'ready-to-install' && <button className="button button--primary" type="button" disabled={busy || !state.canInstall} title={state.isProcessingClip ? 'Wait for the current clip to finish.' : undefined} onClick={() => {
        if (!requestInstallConfirmation(latestVersion ?? 'new version', (message) => window.confirm(message))) return
        void perform(() => window.liveCutter.installAppUpdate())
      }}>INSTALL AND RESTART</button>}
    </div>
    {actionError && <p className="form-notice form-notice--error" role="alert">{actionError}</p>}
  </section>
}
