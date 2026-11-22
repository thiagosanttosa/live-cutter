import { useEffect, useRef, useState } from 'react'
import ActionButtons from '../components/ActionButtons'
import ClipInformation from '../components/ClipInformation'
import TimeInput from '../components/TimeInput'
import VideoDetails from '../components/VideoDetails'
import VideoUrlInput from '../components/VideoUrlInput'
import type { ClipFormValues, ClipProgressEvent, FormErrors, VideoLookupErrorCode, VideoMetadata } from '../types/video'
import { formatTime, parseTime, validateRange } from '../utils/time'
import { isYouTubeUrl } from '../utils/youtube'

type LookupStatus = 'idle' | 'validating' | 'loading' | 'success' | 'error'
const initialValues: ClipFormValues = { url: '', start: '', end: '' }

function validateTimes(start: string, end: string, videoDuration: number | null): Pick<FormErrors, 'start' | 'end'> {
  const errors: Pick<FormErrors, 'start' | 'end'> = {}
  if (!start && !end) return errors
  const rangeError = validateRange(start, end, videoDuration)
  if (!rangeError) {
    return errors
  }
  if (!start) errors.start = 'Enter a start time.'
  else if (parseTime(start) === null) errors.start = 'Use HH:MM:SS with minutes and seconds from 00 to 59.'
  if (!end) errors.end = 'Enter an end time.'
  else if (parseTime(end) === null) errors.end = 'Use HH:MM:SS with minutes and seconds from 00 to 59.'
  else if (rangeError) errors.end = rangeError === 'End time exceeds the video duration.' && videoDuration !== null
    ? `End time exceeds the video length of ${formatTime(videoDuration)}.`
    : rangeError
  return errors
}

function errorMessage(code: VideoLookupErrorCode): string {
  switch (code) {
    case 'INVALID_URL': return 'Enter a valid HTTPS YouTube URL, then try again.'
    case 'YTDLP_NOT_FOUND': return 'yt-dlp was not found. See the setup instructions in README.md.'
    case 'YTDLP_INCOMPATIBLE': return 'The installed yt-dlp version is too old or unsupported.'
    case 'TIMEOUT': return 'The request took too long. Try again later.'
    case 'VIDEO_UNAVAILABLE': return 'This video is private, removed, or unavailable.'
    case 'NETWORK': return 'Could not reach YouTube. Check your internet connection.'
    case 'METADATA_PARSE': return 'The video information could not be read.'
    case 'PROCESS': return 'yt-dlp could not check this video. It may be unavailable or access restricted.'
  }
}

export default function Home() {
  const [values, setValues] = useState<ClipFormValues>(initialValues)
  const [errors, setErrors] = useState<FormErrors>({})
  const [showErrors, setShowErrors] = useState(false)
  const [status, setStatus] = useState<LookupStatus>('idle')
  const [video, setVideo] = useState<VideoMetadata | null>(null)
  const [notice, setNotice] = useState('')
  const [version, setVersion] = useState('')
  const [clipProgress, setClipProgress] = useState<ClipProgressEvent | null>(null)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [clipNotice, setClipNotice] = useState('')
  const clipProgressRef = useRef<ClipProgressEvent | null>(null)
  const activeJobRef = useRef<string | null>(null)

  useEffect(() => window.liveCutter.onClipProgress((progress) => {
    clipProgressRef.current = progress
    setClipProgress(progress)
    if (progress.stage === 'completed' || progress.stage === 'error' || progress.stage === 'cancelled') {
      activeJobRef.current = null
      setActiveJobId(null)
    } else {
      activeJobRef.current = progress.jobId
      setActiveJobId(progress.jobId)
    }
  }), [])

  const startSeconds = parseTime(values.start)
  const endSeconds = parseTime(values.end)
  const selectedDuration = startSeconds !== null && endSeconds !== null && endSeconds > startSeconds
    ? formatTime(endSeconds - startSeconds)
    : '00:00:00'
  const videoDuration = video?.duration ?? null

  function update<K extends keyof ClipFormValues>(key: K, value: ClipFormValues[K]) {
    const next = { ...values, [key]: key === 'url' ? value.trimStart() : value }
    setValues(next)
    setNotice('')
    setClipNotice('')
    setClipProgress(null)
    clipProgressRef.current = null
    if (key === 'url') {
      setVideo(null)
      setVersion('')
      setStatus('idle')
    }
    if (showErrors) {
      const nextErrors: FormErrors = { ...validateTimes(next.start, next.end, key === 'url' ? null : videoDuration) }
      if (!next.url.trim()) nextErrors.url = 'Paste a YouTube URL to continue.'
      else if (!isYouTubeUrl(next.url)) nextErrors.url = 'Enter a valid HTTPS YouTube video or livestream URL.'
      setErrors(nextErrors)
    }
  }

  function clear() {
    setValues(initialValues)
    setErrors({})
    setShowErrors(false)
    setStatus('idle')
    setVideo(null)
    setVersion('')
    setNotice('')
    setClipNotice('')
    setClipProgress(null)
    clipProgressRef.current = null
    activeJobRef.current = null
    setActiveJobId(null)
  }

  async function checkVideo() {
    if (activeJobId) return
    setStatus('validating')
    setNotice('')
    setVideo(null)
    setVersion('')
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))

    const trimmedUrl = values.url.trim()
    const nextErrors: FormErrors = {}
    if (!trimmedUrl) nextErrors.url = 'Paste a YouTube URL to continue.'
    else if (!isYouTubeUrl(trimmedUrl)) nextErrors.url = 'Enter a valid HTTPS YouTube video or livestream URL.'
    setErrors(nextErrors)
    setShowErrors(true)
    if (Object.keys(nextErrors).length > 0) {
      setStatus('error')
      setNotice('Review the highlighted fields before continuing.')
      return
    }

    setStatus('loading')
    setNotice('Checking video information with yt-dlp…')
    try {
      const result = await window.liveCutter.checkVideo(trimmedUrl)
      if (!result.ok) {
        setStatus('error')
        setNotice(errorMessage(result.error.code))
        setErrors({ url: errorMessage(result.error.code) })
        return
      }
      setVideo(result.data)
      setVersion(result.version)
      const timeErrors = validateTimes(values.start, values.end, result.data.duration)
      setErrors(timeErrors)
      setStatus('success')
      setNotice('Video information loaded. Review its duration and available formats below.')
    } catch {
      setStatus('error')
      setNotice('The app could not contact its local video service. Restart LIVE CUTTER and try again.')
    }
  }

  async function generateClip() {
    if (!video || activeJobRef.current) return
    const rangeError = validateRange(values.start, values.end, video.duration)
    if (rangeError) {
      setErrors({ ...validateTimes(values.start, values.end, video.duration), end: rangeError })
      setShowErrors(true)
      return
    }
    setClipNotice('Starting clip processing…')
    setClipProgress(null)
    clipProgressRef.current = null
    try {
      const result = await window.liveCutter.startClip({ url: values.url.trim(), start: values.start, end: values.end })
      if (!result.ok) { setClipNotice(result.message); return }
      const observedProgress = clipProgressRef.current as ClipProgressEvent | null
      if (observedProgress?.jobId !== result.jobId || !observedProgress.terminal) {
        activeJobRef.current = result.jobId
        setActiveJobId(result.jobId)
      }
      setClipNotice('')
    } catch {
      setClipNotice('The app could not start its local clip service. Restart LIVE CUTTER and try again.')
    }
  }

  async function cancelClip() {
    if (activeJobRef.current && !(await window.liveCutter.cancelClip(activeJobRef.current))) setClipNotice('The clip process has already finished.')
  }

  async function openClip(mode: 'file' | 'folder') {
    if (!clipProgress?.terminal?.ok) return
    const message = await window.liveCutter.openClip(clipProgress.terminal.output.jobId, mode)
    if (message) setClipNotice(message)
  }

  const clipBusy = activeJobId !== null
  const progressPercent = clipProgress?.percent ?? null
  const bytesLabel = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
  const infoStatus = status === 'success' ? 'Video verified' : status === 'loading' || status === 'validating' ? 'Checking video' : status === 'error' ? 'Check failed' : 'Awaiting input'

  return (
    <>
      <div className="content-grid">
        <div className="form-column">
          <section className="panel source-panel" aria-labelledby="source-title">
            <div className="card-heading"><div><p className="eyebrow">STEP 01</p><h2 id="source-title">SOURCE VIDEO</h2></div><span className="step-number">01</span></div>
            <p className="card-description">Enter a public or otherwise accessible YouTube video or completed livestream.</p>
            <VideoUrlInput value={values.url} error={errors.url} disabled={clipBusy} onChange={(value) => update('url', value)} />
            {status === 'loading' && <p className="lookup-progress" role="status"><span className="loading-spinner" /> Contacting YouTube through yt-dlp…</p>}
          </section>

          <section className="panel timestamp-panel" aria-labelledby="timestamp-title">
            <div className="card-heading"><div><p className="eyebrow">STEP 02</p><h2 id="timestamp-title">CLIP TIMESTAMP</h2></div><span className="step-number">02</span></div>
            <p className="card-description">Set a range within the duration reported by the video source.</p>
            <div className="time-fields">
              <TimeInput id="start-time" label="START TIME" value={values.start} error={errors.start} disabled={clipBusy} onChange={(value) => update('start', value)} />
              <span className="time-separator" aria-hidden="true">→</span>
              <TimeInput id="end-time" label="END TIME" value={values.end} error={errors.end} disabled={clipBusy} onChange={(value) => update('end', value)} />
            </div>
            <div className="duration-row"><span>SELECTED DURATION</span><strong>{selectedDuration}</strong></div>
            <div className="duration-source">VIDEO LENGTH <strong>{videoDuration === null ? 'Unknown' : formatTime(videoDuration)}</strong></div>
            <div className="action-area">
              <ActionButtons disabled={clipBusy || status === 'loading' || status === 'validating'} loading={status === 'loading' || status === 'validating'} onCheck={() => void checkVideo()} onClear={clear} />
              {video && status === 'success' && <button className="button button--primary" type="button" disabled={clipBusy || Boolean(validateRange(values.start, values.end, videoDuration))} onClick={() => void generateClip()}>
                {clipBusy ? 'CLIP PROCESSING…' : 'GENERATE CLIP'} <span aria-hidden="true">→</span>
              </button>}
              {notice && <p className={`form-notice ${status === 'error' ? 'form-notice--error' : ''}`} role="status">{notice}</p>}
              {version && status === 'success' && <p className="version-note">yt-dlp {version}</p>}
              {clipNotice && <p className="form-notice form-notice--error" role="status">{clipNotice}</p>}
            </div>
          </section>
        </div>
        <aside className="results-column" aria-live="polite">
          <ClipInformation duration={selectedDuration} totalDuration={videoDuration === null ? 'Unknown' : formatTime(videoDuration)} status={infoStatus} />
          {video && <VideoDetails video={video} />}
          {clipProgress && <section className="clip-progress-card panel" aria-live="polite">
            <p className="eyebrow">CLIP PROCESSING</p>
            <h2>{clipProgress.videoTitle}</h2>
            <p className="clip-progress__range">{values.start} → {values.end} <span>({selectedDuration})</span></p>
            <p className="clip-progress__message">{clipProgress.message}</p>
            {clipProgress.stage !== 'completed' && clipProgress.stage !== 'error' && clipProgress.stage !== 'cancelled' && <>
              <div className={`progress-track ${progressPercent === null ? 'progress-track--indeterminate' : ''}`} role="progressbar" aria-label="Clip processing progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent ?? undefined}>
                <span style={progressPercent === null ? undefined : { width: `${progressPercent}%` }} />
              </div>
              <div className="clip-progress__facts"><span>{progressPercent === null ? 'Progress not available' : `${progressPercent.toFixed(1)}%`}</span><span>{clipProgress.speed ?? (clipProgress.etaSeconds !== null ? `${Math.ceil(clipProgress.etaSeconds)} sec remaining` : clipProgress.stage.toUpperCase())}</span></div>
              <p className="clip-progress__elapsed">ELAPSED {formatTime(clipProgress.elapsedSeconds)}</p>
              {activeJobId && <button className="button button--secondary" type="button" onClick={() => void cancelClip()}>CANCEL</button>}
            </>}
            {clipProgress.terminal?.ok && <>
              <p className="clip-success">Clip created and validated in {formatTime(clipProgress.elapsedSeconds)}.</p>
              <dl className="clip-output-facts"><div><dt>FILE</dt><dd>{clipProgress.terminal.output.fileName}</dd></div><div><dt>DURATION</dt><dd>{formatTime(clipProgress.terminal.output.durationSeconds)}</dd></div><div><dt>RESOLUTION</dt><dd>{clipProgress.terminal.output.width} × {clipProgress.terminal.output.height}</dd></div><div><dt>SIZE</dt><dd>{bytesLabel(clipProgress.terminal.output.fileSizeBytes)}</dd></div><div><dt>SAVED IN</dt><dd>{clipProgress.terminal.output.outputDirectory}</dd></div></dl>
              {clipProgress.terminal.output.historyWarning && <p className="form-notice form-notice--error">{clipProgress.terminal.output.historyWarning}</p>}
              <div className="actions"><button className="button button--primary" type="button" onClick={() => void openClip('file')}>OPEN FILE</button><button className="button button--secondary" type="button" onClick={() => void openClip('folder')}>OPEN FOLDER</button><button className="button button--secondary" type="button" onClick={clear}>NEW CLIP</button></div>
            </>}
          </section>}
        </aside>
      </div>
      <footer className="page-footer"><span>LIVE CUTTER <span className="footer-separator">/</span> CLIP EXTRACTION</span><span>PARTIAL DOWNLOAD · MP4 VALIDATION</span></footer>
    </>
  )
}
