import { formatTime } from '../utils/time'
import type { VideoMetadata } from '../types/video'

interface VideoDetailsProps { video: VideoMetadata }

function display(value: string | null): string { return value ?? 'Not provided' }

export default function VideoDetails({ video }: VideoDetailsProps) {
  const availability = video.availability?.replaceAll('_', ' ') ?? 'Not provided'
  return (
    <>
      <section className="panel video-card" aria-label="Video details">
        <div className="video-card__image-wrap">
          {video.thumbnail
            ? <img className="video-card__image" src={video.thumbnail} alt="Video thumbnail" referrerPolicy="no-referrer" />
            : <div className="video-card__placeholder" aria-label="Thumbnail unavailable"><span aria-hidden="true">▶</span><small>NO THUMBNAIL</small></div>}
        </div>
        <div className="video-card__body">
          <p className="eyebrow">VIDEO FOUND</p>
          <h2>{display(video.title)}</h2>
          <p className="video-card__channel">{display(video.channel ?? video.uploader)}</p>
          <div className="video-card__facts">
            <span><small>DURATION</small><b>{video.duration === null ? 'Not provided' : formatTime(video.duration)}</b></span>
            <span><small>AVAILABILITY</small><b className="capitalize">{availability}</b></span>
          </div>
        </div>
      </section>
      <section className="panel formats-panel" aria-labelledby="formats-title">
        <div className="card-heading"><div><p className="eyebrow">SOURCE OPTIONS</p><h2 id="formats-title">AVAILABLE FORMATS</h2></div><span className="formats-count">{video.formats.length} formats</span></div>
        {video.formats.length === 0
          ? <p className="empty-formats">No format details were returned for this video.</p>
          : <div className="formats-table-wrap"><table className="formats-table"><thead><tr><th>ID</th><th>EXT</th><th>RESOLUTION</th><th>HEIGHT</th><th>WIDTH</th><th>VIDEO</th><th>AUDIO</th></tr></thead><tbody>
            {video.formats.map((format, index) => <tr key={`${format.id ?? 'format'}-${index}`}>
              <td className="info-mono">{display(format.id)}</td><td>{display(format.ext)}</td>
              <td>{format.resolution ?? (format.width && format.height ? `${format.width}×${format.height}` : 'Not provided')}</td>
              <td>{format.height ?? 'Not provided'}</td><td>{format.width ?? 'Not provided'}</td>
              <td>{display(format.videoCodec)}</td><td>{display(format.audioCodec)}</td>
            </tr>)}
          </tbody></table></div>}
        <p className="format-note">Formats are shown for information only. No format is selected or downloaded.</p>
      </section>
    </>
  )
}
