import { useEffect, useState } from 'react'
import FileNamingSettings from '../components/FileNamingSettings'
import OutputSettings from '../components/OutputSettings'
import QualitySettings from '../components/QualitySettings'
import SystemStatus from '../components/SystemStatus'
import AppUpdates from '../components/AppUpdates'
import type { OutputQuality, SystemStatus as SystemStatusData, UserSettings } from '../types/video'

export default function Settings() {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [pattern, setPattern] = useState('')
  const [patternError, setPatternError] = useState('')
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [systemStatus, setSystemStatus] = useState<SystemStatusData | null>(null)
  const [checkingSystem, setCheckingSystem] = useState(true)

  useEffect(() => {
    void window.liveCutter.getSettings().then((value) => {
      if (value) { setSettings(value); setPattern(value.fileNamingPattern) }
      else setError('Settings could not be loaded.')
    }).catch(() => setError('Settings could not be loaded. Restart LIVE CUTTER and try again.'))
  }, [])

  async function refreshSystemStatus() {
    setCheckingSystem(true)
    try { setSystemStatus(await window.liveCutter.getSystemStatus()) }
    catch { setSystemStatus(null) }
    finally { setCheckingSystem(false) }
  }

  useEffect(() => { void refreshSystemStatus() }, [])

  async function updateSettings(action: () => Promise<UserSettings | null>) {
    setBusy(true)
    setError('')
    setSaved('')
    try {
      const next = await action()
      if (next) { setSettings(next); setPattern(next.fileNamingPattern) }
    } catch {
      setError('The setting could not be saved. Check that the selected folder is available and try again.')
    } finally { setBusy(false) }
  }

  async function updateQuality(quality: OutputQuality) {
    await updateSettings(() => window.liveCutter.setOutputQuality(quality))
  }

  async function savePattern() {
    setPatternError('')
    setSaved('')
    setBusy(true)
    try {
      const next = await window.liveCutter.setFileNamingPattern(pattern)
      if (next) { setSettings(next); setPattern(next.fileNamingPattern); setSaved('File naming preference saved.') }
    } catch (cause) {
      setPatternError(cause instanceof Error ? cause.message : 'This naming pattern is not supported.')
    } finally { setBusy(false) }
  }

  async function openOutput() {
    setBusy(true)
    setError('')
    try {
      const message = await window.liveCutter.openOutputDirectory()
      if (message) setError(message)
    } catch { setError('The output folder could not be opened.') }
    finally { setBusy(false) }
  }

  return <div className="settings-page">
    <AppUpdates />
    <SystemStatus status={systemStatus} loading={checkingSystem} onRefresh={() => void refreshSystemStatus()} />
    <OutputSettings
      directory={settings?.outputDirectory ?? 'Loading output folder…'}
      disabled={busy || !settings}
      onChoose={() => void updateSettings(() => window.liveCutter.chooseOutputDirectory())}
      onRestore={() => void updateSettings(() => window.liveCutter.restoreOutputDirectory())}
      onOpen={() => void openOutput()}
    />
    <QualitySettings quality={settings?.quality ?? 'original'} disabled={busy || !settings} onChange={(quality) => void updateQuality(quality)} />
    <FileNamingSettings
      value={pattern}
      disabled={busy || !settings}
      error={patternError}
      saved={saved}
      onChange={(value) => { setPattern(value); setPatternError(''); setSaved('') }}
      onSave={() => void savePattern()}
    />
    {error && <p className="form-notice form-notice--error" role="alert">{error}</p>}
  </div>
}
