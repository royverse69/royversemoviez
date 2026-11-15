import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  buildDownloadUrl,
  downloadApiRequest,
  getDownloadApiBaseUrl,
} from '../api/downloadApi.js'

function formatSize(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`
  return `${(value / 1024 ** 2).toFixed(0)} MB`
}

export default function DownloadsPage() {
  const [params] = useSearchParams()
  const tmdbTitle = params.get('title') || ''
  const tmdbYear = params.get('year') || ''
  const mediaType = params.get('type') === 'tv' ? 'tv' : 'movie'
  const initialSeason = Math.max(1, Number(params.get('season')) || 1)
  const initialEpisode = Math.max(1, Number(params.get('episode')) || 1)
  const [baseUrl] = useState(getDownloadApiBaseUrl)
  const [matches, setMatches] = useState([])
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [details, setDetails] = useState(null)
  const [audioSubjectId, setAudioSubjectId] = useState('')
  const [season, setSeason] = useState(initialSeason)
  const [episode, setEpisode] = useState(initialEpisode)
  const [releases, setReleases] = useState([])
  const [releaseIndex, setReleaseIndex] = useState(0)
  const [searchLoading, setSearchLoading] = useState(true)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [streamsLoading, setStreamsLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedMatch = matches.find((item) => item.subjectId === selectedSubjectId) || null
  const isSeries = mediaType === 'tv' || details?.media_type === 'series' || details?.mediaType === 'series'
  const availableSeasons = details?.seasons || []
  const selectedSeason = availableSeasons.find((item) => Number(item.number) === Number(season))
  const availableEpisodes = selectedSeason?.episodes || []

  const languages = useMemo(() => {
    if (!details) return []
    const options = [{
      subjectId: details.id?.value || selectedSubjectId,
      label: 'Default audio',
      language: 'Default',
    }]
    for (const dub of details.dubs || []) {
      if (!dub.subject_id || options.some((item) => item.subjectId === dub.subject_id)) continue
      options.push({
        subjectId: dub.subject_id,
        label: dub.label || dub.language || 'Other audio',
        language: dub.language || '',
      })
    }
    return options
  }, [details, selectedSubjectId])

  const loadMatchDetails = useCallback(async (match) => {
    setSelectedSubjectId(match.subjectId)
    setDetails(null)
    setAudioSubjectId('')
    setReleases([])
    setError('')
    setDetailsLoading(true)
    try {
      const data = await downloadApiRequest('/api/details', {
        subjectId: match.subjectId,
      }, baseUrl)
      setDetails(data)
      const defaultSubject = data.id?.value || match.subjectId
      setAudioSubjectId(defaultSubject)

      const seasons = Array.isArray(data.seasons) ? data.seasons : []
      const requested = seasons.find((item) => Number(item.number) === initialSeason)
      const firstSeason = requested || seasons[0]
      if (mediaType === 'tv' || data.media_type === 'series' || data.mediaType === 'series') {
        const nextSeason = Number(firstSeason?.number || initialSeason)
        const firstEpisode = firstSeason?.episodes?.find((item) => Number(item.number) === initialEpisode)
          || firstSeason?.episodes?.[0]
        setSeason(nextSeason)
        setEpisode(Number(firstEpisode?.number || initialEpisode))
      } else {
        setSeason(0)
        setEpisode(0)
      }
    } catch (loadError) {
      setError(loadError.message || 'Could not load MovieBox title details.')
    } finally {
      setDetailsLoading(false)
    }
  }, [baseUrl, initialEpisode, initialSeason, mediaType])

  useEffect(() => {
    let active = true
    async function searchMovieBox() {
      setSearchLoading(true)
      setError('')
      setMatches([])
      if (!tmdbTitle.trim()) {
        setError('Open Downloads from a movie or series page so RoyverseMoviez can send the TMDB title.')
        setSearchLoading(false)
        return
      }
      if (!baseUrl) {
        setError('The MovieBox-TUI backend is not connected. Add its URL in Settings after deploying the included backend.')
        setSearchLoading(false)
        return
      }

      try {
        const results = await downloadApiRequest('/api/search', {
          title: tmdbTitle,
          year: tmdbYear,
          mediaType,
        }, baseUrl)
        if (!active) return
        setMatches(Array.isArray(results) ? results : [])
        if (!results?.length) {
          setError('MovieBox did not return a matching title. Try a different title from the results if one is available.')
          return
        }
        await loadMatchDetails(results[0])
      } catch (searchError) {
        if (active) setError(searchError.message || 'MovieBox search failed.')
      } finally {
        if (active) setSearchLoading(false)
      }
    }
    searchMovieBox()
    return () => { active = false }
  }, [baseUrl, loadMatchDetails, mediaType, tmdbTitle, tmdbYear])

  useEffect(() => {
    let active = true
    async function loadStreams() {
      if (!audioSubjectId || !details) return
      setStreamsLoading(true)
      setReleases([])
      try {
        const data = await downloadApiRequest('/api/streams', {
          subjectId: audioSubjectId,
          season: isSeries ? season : 0,
          episode: isSeries ? episode : 0,
        }, baseUrl)
        if (!active) return
        const options = Array.isArray(data.releases) ? data.releases : []
        setReleases(options)
        setReleaseIndex(options[0]?.releaseIndex ?? 0)
        if (!options.length) setError('No download sources were returned for this language and episode.')
        else setError('')
      } catch (streamError) {
        if (active) setError(streamError.message || 'Could not load download sources.')
      } finally {
        if (active) setStreamsLoading(false)
      }
    }
    loadStreams()
    return () => { active = false }
  }, [audioSubjectId, baseUrl, details, episode, isSeries, season])

  const changeMatch = async (event) => {
    const match = matches.find((item) => item.subjectId === event.target.value)
    if (match) await loadMatchDetails(match)
  }

  const changeSeason = (event) => {
    const next = Number(event.target.value)
    setSeason(next)
    const seasonData = availableSeasons.find((item) => Number(item.number) === next)
    setEpisode(Number(seasonData?.episodes?.[0]?.number || 1))
  }

  const downloadUrl = selectedMatch && audioSubjectId && releases.length
    ? buildDownloadUrl({
        subjectId: audioSubjectId,
        season: isSeries ? season : 0,
        episode: isSeries ? episode : 0,
        releaseIndex,
        title: tmdbTitle || selectedMatch.title,
      }, baseUrl)
    : ''

  return (
    <main className="mobile-downloads-page mx-auto w-full max-w-3xl px-3 pb-12 pt-20 text-white sm:px-6 sm:pt-24">
      <div className="mb-6">
        <p className="text-[10px] font-black uppercase tracking-[.2em] text-brand">RoyverseMoviez · Downloads</p>
        <h1 className="mt-1 text-2xl font-black sm:text-3xl">Download {tmdbTitle || 'a title'}</h1>
        <p className="mt-2 text-xs leading-5 text-mist sm:text-sm">
          The TMDB title is searched in MovieBox-TUI. Choose the matching release, audio language and episode, then download through the backend.
        </p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-mist">TMDB selection</p>
            <p className="mt-1 font-bold text-white">{tmdbTitle || 'No title received'}</p>
            <p className="mt-1 text-xs text-mist">{[tmdbYear, mediaType === 'tv' ? 'Series' : 'Movie'].filter(Boolean).join(' · ')}</p>
          </div>
          <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[9px] font-bold uppercase text-mist">TMDB</span>
        </div>

        {(searchLoading || detailsLoading) && (
          <p role="status" className="mt-5 flex items-center gap-2 text-sm text-mist">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-brand" />
            {searchLoading ? 'Searching MovieBox…' : 'Loading title options…'}
          </p>
        )}

        {!searchLoading && matches.length > 1 && (
          <div className="mt-5">
            <label htmlFor="moviebox-match" className="block text-xs font-bold text-cream">MovieBox match</label>
            <select
              id="moviebox-match"
              value={selectedSubjectId}
              onChange={changeMatch}
              className="mt-2 min-h-11 w-full rounded-lg border border-white/12 bg-[#0d0d0d] px-3 text-sm text-white outline-none focus:border-brand"
            >
              {matches.map((item) => (
                <option key={item.subjectId} value={item.subjectId}>
                  {item.title}{item.year ? ` (${item.year})` : ''} · {item.mediaType === 'tv' ? 'Series' : 'Movie'}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedMatch && details && (
          <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] font-black uppercase tracking-[.14em] text-emerald-300">Matched from MovieBox-TUI</p>
            <p className="mt-1 text-sm font-bold text-white">{selectedMatch.title}</p>
            <p className="mt-1 text-xs text-mist">{selectedMatch.year || 'Year unavailable'} · {selectedMatch.mediaType === 'tv' ? 'Series' : 'Movie'}</p>
          </div>
        )}

        {details && languages.length > 1 && (
          <div className="mt-5">
            <label htmlFor="download-language" className="block text-xs font-bold text-cream">Audio language</label>
            <select
              id="download-language"
              value={audioSubjectId}
              onChange={(event) => setAudioSubjectId(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-lg border border-white/12 bg-[#0d0d0d] px-3 text-sm text-white outline-none focus:border-brand"
            >
              {languages.map((item) => (
                <option key={item.subjectId} value={item.subjectId}>
                  {item.label}{item.language && item.language !== 'Default' && item.label !== item.language ? ` · ${item.language}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {details && isSeries && (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="download-season" className="block text-xs font-bold text-cream">Season</label>
              <select
                id="download-season"
                value={season}
                onChange={changeSeason}
                className="mt-2 min-h-11 w-full rounded-lg border border-white/12 bg-[#0d0d0d] px-3 text-sm text-white outline-none focus:border-brand"
              >
                {(availableSeasons.length ? availableSeasons : [{ number: season }]).map((item) => (
                  <option key={item.number} value={item.number}>Season {item.number}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="download-episode" className="block text-xs font-bold text-cream">Episode</label>
              <select
                id="download-episode"
                value={episode}
                onChange={(event) => setEpisode(Number(event.target.value))}
                className="mt-2 min-h-11 w-full rounded-lg border border-white/12 bg-[#0d0d0d] px-3 text-sm text-white outline-none focus:border-brand"
              >
                {(availableEpisodes.length ? availableEpisodes : [{ number: episode }]).map((item) => (
                  <option key={item.number} value={item.number}>
                    Episode {item.number}{item.title ? ` · ${item.title}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {details && (
          <div className="mt-5">
            <label htmlFor="download-release" className="block text-xs font-bold text-cream">Download quality</label>
            {streamsLoading ? (
              <p className="mt-2 text-xs text-mist">Finding available releases…</p>
            ) : (
              <select
                id="download-release"
                value={releaseIndex}
                onChange={(event) => setReleaseIndex(Number(event.target.value))}
                disabled={!releases.length}
                className="mt-2 min-h-11 w-full rounded-lg border border-white/12 bg-[#0d0d0d] px-3 text-sm text-white outline-none focus:border-brand disabled:opacity-50"
              >
                {releases.map((item) => (
                  <option key={item.releaseIndex} value={item.releaseIndex}>
                    {[item.quality || 'Available', item.language, formatSize(item.sizeBytes), item.source].filter(Boolean).join(' · ')}
                  </option>
                ))}
              </select>
            )}
            {releases[0]?.filename && (
              <p className="mt-2 truncate text-[10px] text-mist/75">File: {releases.find((item) => item.releaseIndex === releaseIndex)?.filename || releases[0].filename}</p>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-400/20 bg-red-400/5 px-3 py-2.5 text-xs leading-5 text-red-200">
            {error}
          </p>
        )}

        {downloadUrl && (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-black text-white transition hover:bg-brand-hover"
          >
            <span aria-hidden="true">↓</span>
            Download selected release
          </a>
        )}

        {!baseUrl && (
          <Link to="/settings" className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-white/15 px-4 text-xs font-bold text-cream hover:bg-white/5">
            Configure Download Backend in Settings
          </Link>
        )}
      </section>

      <p className="mt-4 text-[10px] leading-5 text-mist/60">
        Download sources are provided by the configured backend. Availability, audio tracks and quality depend on the selected provider result.
      </p>
    </main>
  )
}
