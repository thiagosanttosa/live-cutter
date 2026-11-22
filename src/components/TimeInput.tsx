interface TimeInputProps { id: string; label: string; value: string; error?: string; disabled?: boolean; onChange: (value: string) => void }

export default function TimeInput({ id, label, value, error, disabled = false, onChange }: TimeInputProps) {
  function update(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 6)
    const formatted = digits.replace(/^(\d{2})(\d)/, '$1:$2').replace(/^(\d{2}:\d{2})(\d)/, '$1:$2')
    onChange(formatted)
  }
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <input className={`time-input ${error ? 'time-input--error' : ''}`} id={id} type="text" inputMode="numeric" autoComplete="off" placeholder="HH:MM:SS" value={value} onChange={(event) => update(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} disabled={disabled} />
      {error && <p className="field__error" id={`${id}-error`}>{error}</p>}
    </div>
  )
}
