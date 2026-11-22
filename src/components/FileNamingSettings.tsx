import { makeFileNamePreview } from '../utils/naming'

interface FileNamingSettingsProps {
  value: string
  disabled: boolean
  error: string
  saved: string
  onChange: (value: string) => void
  onSave: () => void
}

export default function FileNamingSettings({ value, disabled, error, saved, onChange, onSave }: FileNamingSettingsProps) {
  let preview = ''
  try { preview = makeFileNamePreview(value) } catch { /* Invalid patterns are explained below. */ }
  return <section className="panel settings-section" aria-labelledby="naming-settings-title">
    <p className="eyebrow">FILE NAMING</p>
    <h2 id="naming-settings-title">Name your clips</h2>
    <label className="field__label" htmlFor="file-naming-pattern">PATTERN</label>
    <input className={`settings-text-input ${error ? 'time-input--error' : ''}`} id="file-naming-pattern" value={value} maxLength={160} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    <p className="settings-copy">Available variables: {'{title}'}, {'{start}'}, {'{end}'}, {'{date}'}. Unknown variables are rejected.</p>
    <div className="naming-preview"><span>PREVIEW</span><strong>{preview || 'Enter a valid pattern'}</strong></div>
    {error && <p className="field__error" role="alert">{error}</p>}
    {saved && <p className="form-notice" role="status">{saved}</p>}
    <div className="actions"><button className="button button--primary" type="button" onClick={onSave} disabled={disabled}>SAVE FILE NAMING</button></div>
  </section>
}
