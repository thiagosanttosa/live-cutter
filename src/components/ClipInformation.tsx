interface ClipInformationProps { duration: string; totalDuration: string; status: string }

export default function ClipInformation({ duration, totalDuration, status }: ClipInformationProps) {
  return (
    <section className="info-card" aria-labelledby="clip-info-title">
      <div className="card-heading"><div><p className="eyebrow">OVERVIEW</p><h2 id="clip-info-title">CLIP INFORMATION</h2></div><span className="info-icon" aria-hidden="true">▤</span></div>
      <dl className="info-list">
        <div><dt>Source</dt><dd><span className="source-mark">▶</span> YouTube</dd></div>
        <div><dt>Duration</dt><dd className="info-mono">{duration}</dd></div>
        <div><dt>Video length</dt><dd className="info-mono">{totalDuration}</dd></div>
        <div><dt>Output format</dt><dd><span className="format-tag">MP4</span></dd></div>
        <div><dt>Status</dt><dd><span className="status__dot status__dot--muted" />{status}</dd></div>
      </dl>
      <p className="info-note">Video processing will be added in a future update.</p>
    </section>
  )
}
