interface OutputSettingsProps {
  directory: string
  disabled: boolean
  onChoose: () => void
  onRestore: () => void
  onOpen: () => void
}

export default function OutputSettings({ directory, disabled, onChoose, onRestore, onOpen }: OutputSettingsProps) {
  return <section className="panel settings-section" aria-labelledby="output-settings-title">
    <p className="eyebrow">OUTPUT SETTINGS</p>
    <h2 id="output-settings-title">Destination folder</h2>
    <p className="settings-copy">Completed clips are saved to this folder. Temporary processing files stay separate.</p>
    <div className="settings-path" title={directory}>{directory}</div>
    <div className="actions">
      <button className="button button--primary" type="button" onClick={onChoose} disabled={disabled}>CHOOSE FOLDER</button>
      <button className="button button--secondary" type="button" onClick={onRestore} disabled={disabled}>RESTORE DEFAULT</button>
      <button className="button button--secondary" type="button" onClick={onOpen} disabled={disabled}>OPEN FOLDER</button>
    </div>
  </section>
}
