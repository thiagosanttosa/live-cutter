import type { OutputQuality } from '../types/video'

interface QualitySettingsProps {
  quality: OutputQuality
  disabled: boolean
  onChange: (quality: OutputQuality) => void
}

export default function QualitySettings({ quality, disabled, onChange }: QualitySettingsProps) {
  return <section className="panel settings-section" aria-labelledby="quality-settings-title">
    <p className="eyebrow">OUTPUT QUALITY</p>
    <h2 id="quality-settings-title">Choose a format preference</h2>
    <label className="choice-row">
      <input type="radio" name="output-quality" value="original" checked={quality === 'original'} disabled={disabled} onChange={() => onChange('original')} />
      <span><strong>ORIGINAL QUALITY</strong><small>Request the best available source. Keep compatible streams without an extra conversion.</small></span>
    </label>
    <label className="choice-row">
      <input type="radio" name="output-quality" value="compatibility" checked={quality === 'compatibility'} disabled={disabled} onChange={() => onChange('compatibility')} />
      <span><strong>COMPATIBILITY</strong><small>Prefer H.264/AAC MP4 sources. If none are available, convert as needed. This may take longer and can reduce quality compared with the source.</small></span>
    </label>
  </section>
}
