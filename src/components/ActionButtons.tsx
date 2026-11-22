interface ActionButtonsProps { disabled: boolean; loading: boolean; onCheck: () => void; onClear: () => void }

export default function ActionButtons({ disabled, loading, onCheck, onClear }: ActionButtonsProps) {
  return (
    <div className="actions">
      <button className="button button--primary" type="button" onClick={onCheck} disabled={disabled} aria-busy={loading}>
        {loading ? <><span className="loading-spinner" aria-hidden="true" /> CHECKING VIDEO…</> : <>CHECK VIDEO <span aria-hidden="true">→</span></>}
      </button>
      <button className="button button--secondary" type="button" onClick={onClear} disabled={loading}>CLEAR FIELDS</button>
    </div>
  )
}
