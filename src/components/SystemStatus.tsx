import type { SystemStatus as SystemStatusData } from '../types/video'

interface Props {
  status: SystemStatusData | null
  loading: boolean
  onRefresh: () => void
}

function Row({ label, available, version, message }: { label: string; available: boolean; version?: string | null; message: string }) {
  return <div className="system-status__row">
    <span className={`system-status__dot ${available ? 'system-status__dot--ok' : 'system-status__dot--error'}`} aria-hidden="true" />
    <div className="system-status__copy">
      <strong>{label}{version ? <span className="system-status__version">{version}</span> : null}</strong>
      <small>{message}</small>
    </div>
    <span className={`system-status__badge ${available ? 'system-status__badge--ok' : 'system-status__badge--error'}`}>
      {available ? 'AVAILABLE' : 'ACTION NEEDED'}
    </span>
  </div>
}

export default function SystemStatus({ status, loading, onRefresh }: Props) {
  return <section className="panel settings-section system-status" aria-labelledby="system-status-heading">
    <div className="settings-card__heading">
      <div><p className="eyebrow">DIAGNOSTICS</p><h2 id="system-status-heading">SYSTEM STATUS</h2></div>
      <button className="button button--secondary" onClick={onRefresh} disabled={loading}>
        {loading ? 'CHECKING…' : 'CHECK AGAIN'}
      </button>
    </div>
    {!status ? <p className="system-status__empty" role="status">{loading ? 'Checking installed tools and output folder…' : 'System status could not be loaded. Check again.'}</p> : <>
      <div className="system-status__rows">
        <Row label={`LIVE CUTTER ${status.app.version}`} available={status.app.available} message={status.app.message} />
        <Row label="yt-dlp" available={status.ytDlp.available} version={status.ytDlp.version} message={status.ytDlp.message} />
        <Row label="FFmpeg" available={status.ffmpeg.available} version={status.ffmpeg.version} message={status.ffmpeg.message} />
        <Row label="FFprobe" available={status.ffprobe.available} version={status.ffprobe.version} message={status.ffprobe.message} />
        <Row label="Output folder" available={status.outputFolder.available} message={`${status.outputFolder.path} — ${status.outputFolder.message}`} />
      </div>
      <p className="system-status__note">Checks run the bundled programs and confirm the output folder can be written. No network request is made.</p>
    </>}
  </section>
}
