import { useMemo } from 'react'
import { useData } from '../hooks/useData.js'
import { usePagedData } from '../hooks/usePagedData.js'
import { getTrending, getCatalogSource } from '../api/dataService.js'
import { useApiKey } from '../context/ApiKeyContext.jsx'
import { usePreferences } from '../context/PreferencesContext.jsx'
import FeaturedCarousel from '../components/FeaturedCarousel.jsx'
import Row from '../components/Row.jsx'
import MediaGrid from '../components/MediaGrid.jsx'
import { sortByPopularity } from '../data/media.js'

export default function TypePage({ mediaType, sources, label }) {
  const { apiKey } = useApiKey()
  const { country } = usePreferences()
  const trending = useData(() => getTrending(mediaType, country), [mediaType, apiKey, country])
  const featured = useMemo(
    () => (trending.data && trending.data.length ? sortByPopularity(trending.data).slice(0, 6) : []),
    [trending.data]
  )

  return (
    <div className="mobile-type-page pb-10">
      <FeaturedCarousel items={featured} label={label} />
      <div className="relative z-10 mt-4 space-y-10">
        {sources.map((source) => (
          <TypeRow key={source.label} source={source} />
        ))}
        <CatalogGrid mediaType={mediaType} country={country} />
      </div>
    </div>
  )
}

function TypeRow({ source }) {
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

// Every title of this type, loading more as the user scrolls down the page.
function CatalogGrid({ mediaType, country }) {
  const { apiKey } = useApiKey()
  const source = useMemo(() => getCatalogSource(mediaType, country), [mediaType, country])
  const state = usePagedData(source.fetchPage, [source.label, apiKey])
  return (
    <section className="px-4 sm:px-6 lg:px-10">
      <h2 className="mb-3 pl-1 text-lg font-bold text-cream sm:text-xl">{source.label}</h2>
      <MediaGrid
        items={state.items}
        loading={state.loading}
        error={state.error}
        onRetry={state.retry}
        hasMore={state.hasMore}
        loadingMore={state.loadingMore}
        loadMoreError={state.loadMoreError}
        onLoadMore={state.loadMore}
      />
    </section>
  )
}
