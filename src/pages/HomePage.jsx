import { Fragment, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useData } from '../hooks/useData.js'
import { usePagedData } from '../hooks/usePagedData.js'
import { getTrending, getRowSources, getRecommendationsForHistory } from '../api/dataService.js'
import { useApiKey } from '../context/ApiKeyContext.jsx'
import { useHistory } from '../context/HistoryContext.jsx'
import { usePreferences } from '../context/PreferencesContext.jsx'
import FeaturedCarousel from '../components/FeaturedCarousel.jsx'
import Row from '../components/Row.jsx'
import MovieCard from '../components/MovieCard.jsx'
import { posterUrl, backdropUrl, POSTER_PLACEHOLDER } from '../api/tmdb.js'
import { sortByPopularity } from '../data/media.js'
import { HistoryIcon } from '../components/icons.jsx'

export default function HomePage() {
  const navigate = useNavigate()
  const { apiKey } = useApiKey()
  const { items: historyItems } = useHistory()
  const { country } = usePreferences()
  const trending = useData(() => getTrending(null, country), [apiKey, country])
  const featured = useMemo(
    () => (trending.data && trending.data.length ? sortByPopularity(trending.data).slice(0, 6) : []),
    [trending.data]
  )

  return (
    <div className="pb-10">
      <FeaturedCarousel items={featured} />

      <div className="relative z-10 mt-4 space-y-8 sm:mt-6 sm:space-y-10">
        <TopTenRow items={(trending.data || []).slice(0, 10)} onSelect={(item) => navigate(`/watch/${item.mediaType}/${item.id}`)} />
        {historyItems.length > 0 && (
          <ContinueWatchingRow items={historyItems} />
        )}

        {getRowSources(country).map((source) => (
          <Fragment key={source.label}>
            <HomeRow source={source} />
          </Fragment>
        ))}

        {historyItems.length > 0 && (
          <BecauseYouWatchedRow historyItems={historyItems} />
        )}
      </div>
    </div>
  )
}

function TopTenRow({ items, onSelect }) {
  if (!items?.length) return null
  return (
    <section className="relative -mx-1 px-3 sm:px-6 lg:px-10">
      <div className="mb-3 flex items-center gap-2 pl-1">
        <span className="h-6 w-1 rounded-full bg-brand" />
        <h2 className="text-base font-black text-white sm:text-xl">Top 10 Today</h2>
        <span className="ml-auto text-[9px] font-black uppercase tracking-[.18em] text-mist sm:text-[10px]">Popular picks</span>
      </div>
      <div className="no-scrollbar flex snap-x snap-mandatory gap-1 overflow-x-auto scroll-smooth pb-2 pt-1 sm:gap-2">
        {items.map((item, index) => (
          <button
            key={item.key}
            onClick={() => onSelect(item)}
            className="group relative flex w-[clamp(130px,34vw,196px)] shrink-0 snap-start items-end pl-7 text-left sm:w-[190px] lg:w-[210px]"
            aria-label={`Number ${index + 1}: ${item.title}`}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-0 z-0 text-[5.5rem] font-black leading-[.82] tracking-tighter text-transparent sm:text-[8rem]"
              style={{ WebkitTextStroke: '1.4px rgba(245,245,245,.9)' }}
            >
              {index + 1}
            </span>
            <div className="relative z-10 ml-1 w-full overflow-hidden rounded-lg border border-white/10 bg-surface shadow-xl shadow-black/30 transition duration-300 group-hover:-translate-y-1 group-hover:border-white/30">
              <div className="relative aspect-[2/3] overflow-hidden">
                <img
                  src={posterUrl(item.poster, 'w342') || POSTER_PLACEHOLDER}
                  alt={item.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                {item.rating > 0 && (
                  <span className="absolute right-1.5 top-1.5 rounded bg-black/80 px-1.5 py-1 text-[9px] font-black text-yellow-300">
                    ★ {item.rating.toFixed(1)}
                  </span>
                )}
              </div>
              <p className="truncate px-2 py-2 text-[10px] font-bold text-white sm:text-xs">{item.title}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

function HomeRow({ source }) {
  const { apiKey } = useApiKey()
  const state = usePagedData(source.fetchPage, [source.label, apiKey])
  return (
    <Row
      title={source.label}
      items={state.items}
      loading={state.loading}
      error={state.error}
      onRetry={state.retry}
      hasMore={state.hasMore}
      loadingMore={state.loadingMore}
      loadMoreError={state.loadMoreError}
      onLoadMore={state.loadMore}
    />
  )
}

function ContinueWatchingRow({ items }) {
  return (
    <section className="relative -mx-1 px-4 sm:px-6 lg:px-10">
      <div className="mb-3 flex items-center gap-2 pl-1">
        <HistoryIcon className="h-5 w-5 text-brand" />
        <h2 className="text-lg font-bold text-cream sm:text-xl">Continue Watching</h2>
        <Link to="/history" className="ml-auto text-xs font-semibold text-mist transition hover:text-white">
          View all
        </Link>
      </div>
      <div className="no-scrollbar flex gap-3 overflow-x-auto scroll-smooth py-5">
        {items.slice(0, 12).map((entry) => (
          <HistoryCard key={entry.key} entry={entry} />
        ))}
      </div>
    </section>
  )
}

function HistoryCard({ entry }) {
  const mobileMedia = {
    ...entry,
    poster: backdropUrl(entry.backdrop) || posterUrl(entry.poster, 'w342'),
  }
  const progress = { current: entry.positionSeconds, total: entry.durationSeconds }
  return (
    <>
      <div className="hidden w-[clamp(112px,28vw,184px)] shrink-0 lg:block">
        <MovieCard media={entry} getPath={watchPath} progress={progress} />
      </div>
      <div className="home-history-card w-[72vw] max-w-[270px] shrink-0 lg:hidden">
        <MovieCard media={mobileMedia} getPath={watchPath} progress={progress} fill />
      </div>
    </>
  )
}

function watchPath(entry) {
  if (entry.mediaType === 'tv' && entry.season) {
    return `/watch/${entry.mediaType}/${entry.id}?s=${entry.season}&e=${entry.episode ?? 1}`
  }
  return `/watch/${entry.mediaType}/${entry.id}`
}

function BecauseYouWatchedRow({ historyItems }) {
  const { apiKey } = useApiKey()
  const recent = historyItems[0]
  const state = useData(
    () => getRecommendationsForHistory(historyItems),
    [recent?.key, apiKey]
  )
  if (!state.data?.length && !state.loading) return null
  return (
    <Row
      title={`Because you watched ${recent?.title || 'a title'}`}
      items={state.data}
      loading={state.loading}
      error={state.error}
      onRetry={state.retry}
    />
  )
}
