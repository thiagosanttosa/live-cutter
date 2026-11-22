interface VideoUrlInputProps { value: string; error?: string; disabled?: boolean; onChange: (value: string) => void }

export default function VideoUrlInput({ value, error, disabled = false, onChange }: VideoUrlInputProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor="video-url">YOUTUBE URL</label>
      <div className={`input-wrap ${error ? 'input-wrap--error' : ''}`}>
        <span className="input-icon input-icon--youtube" aria-hidden="true">▶</span>
        <input id="video-url" type="url" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Paste YouTube livestream URL" aria-invalid={Boolean(error)} aria-describedby={error ? 'url-error' : undefined} disabled={disabled} />
        {value && <button className="input-clear" type="button" onClick={() => onChange('')} aria-label="Clear URL" disabled={disabled}>×</button>}
      </div>
      {error && <p className="field__error" id="url-error">{error}</p>}
      <p className="field__hint">Secure YouTube links: youtube.com/watch, youtube.com/live or youtu.be</p>
    </div>
  )
}
