import { isMock } from '../api/client'
import type { RadiationEvent } from '../api/schemas'
import { ErrorNotice, ExternalLink, formatDate, Loading } from './ui'

export function SpaceWeather({ events, loading, error, retry }: { events?: RadiationEvent[]; loading: boolean; error: string; retry: () => void }) {
  return <section className="space-weather section page-width" aria-labelledby="weather-title"><div><span className="section-number">03 / MISSION ENVIRONMENT</span><h2 id="weather-title">Space weather</h2><p>Solar energetic particle events</p></div><div className="weather-events"><ErrorNotice error={error} retry={retry} />{loading && !events ? <Loading /> : null}{events?.length === 0 ? <p>No SEP events reported by the API.</p> : events?.map((event) => <div className="weather-event" key={event.sepID}><div><span className="mono weather-event-label"><span className="status-dot" />{isMock ? 'SAMPLE SEP EVENT' : 'RECORDED SEP EVENT'}</span><time dateTime={event.eventTime}>{formatDate(event.eventTime,true)}</time><p>{event.instruments.join(' · ')}</p><p className="fine-print">{isMock ? 'Illustrative archive entry. Not a current space-weather alert.' : 'Cached event record. Check the source timestamp before use.'}</p></div><ExternalLink href={event.link}>{isMock ? 'DONKI archive' : 'View NASA event'}</ExternalLink></div>)}</div></section>
}
