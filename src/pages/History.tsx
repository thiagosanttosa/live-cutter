import { useEffect, useState } from 'react'
import type { ClipHistoryEntry } from '../types/video'
import { formatTime } from '../utils/time'

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function statusLabel(status: ClipHistoryEntry['status']): string {
  return status === 'completed' ? 'COMPLETED' : status === 'cancelled' ? 'CANCELLED' : 'ERROR'
}

export default function History({ active }: { active: boolean }) {
  const [entries, setEntries] = useState<ClipHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')

  async function refresh() {
    setLoading(true)
    setMessage('')
    try {
      const history = await window.liveCutter.listClipHistory()
      if (history) setEntries(history)
      else setMessage('Clip history could not be loaded.')
    } catch { setMessage('Clip history could not be loaded. Restart LIVE CUTTER and try again.') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (!active) return
    void refresh()
    return window.liveCutter.onClipProgress((progress) => {
      if (progress.stage === 'completed' || progress.stage === 'error' || progress.stage === 'cancelled') void refresh()
    })
  }, [active])

  async function removeRecord(id: string) {
    setBusyId(id)
    setMessage('')
    try {
      if (await window.liveCutter.removeClipHistoryEntry(id)) setEntries((current) => current.filter((entry) => entry.id !== id))
      else setMessage('This history record is no longer available.')
    } catch { setMessage('The history record could not be removed.') }
    finally { setBusyId('') }
  }

  async function clearHistory() {
    if (!window.confirm('Clear all clip history records? Saved video files will remain in their folders.')) return
    setBusyId('all')
    try {
      if (await window.liveCutter.clearClipHistory()) setEntries([])
      else setMessage('Clip history could not be cleared.')
    } catch { setMessage('Clip history could not be cleared.') }
    finally { setBusyId('') }
  }

  async function openEntry(entry: ClipHistoryEntry, mode: 'file' | 'folder') {
    setBusyId(entry.id)
    setMessage('')
    try {
      const result = await window.liveCutter.openHistoryEntry(entry.id, mode)
      if (result) setMessage(result)
    } catch { setMessage('The selected clip could not be opened.') }
    finally { setBusyId('') }
  }

  return <section className="history-page" aria-labelledby="history-title">
    <div className="history-heading"><div><p className="eyebrow">LOCAL RECORDS</p><h2 id="history-title">CLIP HISTORY</h2><p className="settings-copy">Completed clips and processing attempts stored on this device.</p></div>
      <div className="actions"><button className="button button--secondary" type="button" onClick={() => void refresh()} disabled={loading || busyId !== ''}>REFRESH</button>{entries.length > 0 && <button className="button button--secondary" type="button" onClick={() => void clearHistory()} disabled={busyId !== ''}>CLEAR HISTORY</button>}</div>
    </div>
    {message && <p className="form-notice form-notice--error" role="status">{message}</p>}
    {loading ? <div className="panel history-empty"><span className="loading-spinner" /> Loading clip history…</div>
      : entries.length === 0 ? <div className="panel history-empty"><p className="eyebrow">NO RECORDS</p><p>Your completed clips will appear here after FFprobe validates them.</p></div>
        : <div className="history-list">{entries.map((entry) => <article className="panel history-entry" key={entry.id}>
          <div className="history-entry__heading"><div className="history-entry__title"><h3>{entry.fileName ?? entry.title}</h3><p>{entry.title}</p></div><span className={`history-status history-status--${entry.status}`}>{statusLabel(entry.status)}</span></div>
          <div className="history-facts"><span><small>CREATED</small><b>{new Date(entry.createdAt).toLocaleString()}</b></span><span><small>INTERVAL</small><b>{entry.start} → {entry.end}</b></span><span><small>DURATION</small><b>{entry.durationSeconds === null ? '—' : formatTime(entry.durationSeconds)}</b></span><span><small>SIZE</small><b>{formatBytes(entry.fileSizeBytes)}</b></span><span><small>RESOLUTION</small><b>{entry.width && entry.height ? `${entry.width} × ${entry.height}` : '—'}</b></span></div>
          {entry.status === 'completed' ? <div className="actions"><button className="button button--primary" type="button" disabled={busyId === entry.id} onClick={() => void openEntry(entry, 'file')}>OPEN FILE</button><button className="button button--secondary" type="button" disabled={busyId === entry.id} onClick={() => void openEntry(entry, 'folder')}>OPEN FOLDER</button><button className="button button--secondary" type="button" disabled={busyId === entry.id} onClick={() => void removeRecord(entry.id)}>REMOVE RECORD</button></div>
            : <div className="history-entry__footer"><p>{entry.message ?? 'This processing attempt did not produce a clip.'}</p><button className="button button--secondary" type="button" disabled={busyId === entry.id} onClick={() => void removeRecord(entry.id)}>REMOVE RECORD</button></div>}
          <details className="history-details"><summary>CLIP DETAILS</summary><dl><div><dt>Start time</dt><dd>{entry.start}</dd></div><div><dt>End time</dt><dd>{entry.end}</dd></div><div><dt>Quality preference</dt><dd>{entry.quality === 'original' ? 'Original quality' : 'Compatibility'}</dd></div>{entry.outputDirectory && <div><dt>Saved in</dt><dd>{entry.outputDirectory}</dd></div>}</dl></details>
        </article>)}</div>}
  </section>
}
