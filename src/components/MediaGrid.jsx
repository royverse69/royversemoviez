import MovieCard from './MovieCard.jsx'
import { useLoadMoreSentinel } from '../hooks/useLoadMoreSentinel.js'

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'

// Pass `hasMore` + `onLoadMore` to load further pages as the user scrolls
// down the page; without them it renders a fixed list.
export default function MediaGrid({
  items,
  loading,
  error,
  onRetry,
  emptyText = 'Nothing here yet.',
  hasMore = false,
  loadingMore = false,
  loadMoreError = null,
  onLoadMore,
}) {
  const canLoadMore = Boolean(onLoadMore) && hasMore && !loading && !error && items?.length > 0
  const sentinelRef = useLoadMoreSentinel({
    onLoadMore,
    enabled: canLoadMore && !loadingMore && !loadMoreError,
    // Start fetching well before the user hits the bottom.
    rootMargin: '0px 0px 800px 0px',
  })

  if (error) {
    return (
      <div className="rounded-xl border border-white/10 bg-surface p-8 text-center">
        <p className="text-red-400">Something went wrong while loading.</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 rounded bg-white px-5 py-2 text-sm font-bold text-black hover:bg-cream"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className={GRID}>
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} className="skeleton aspect-[2/3] w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (!items || items.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-surface p-10 text-center">
        <p className="text-mist">{emptyText}</p>
      </div>
    )
  }

  return (
    <>
      <div className={GRID}>
        {items.map((m) => (
          <MovieCard key={m.key} media={m} fill />
        ))}
        {loadingMore &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={`more-${i}`} className="skeleton aspect-[2/3] w-full rounded-lg" />
          ))}
      </div>
      {loadMoreError && !loadingMore && (
        <div className="mt-6 text-center">
          <p className="text-sm text-red-400">Couldn't load more titles.</p>
          <button
            onClick={onLoadMore}
            className="mt-3 rounded bg-white px-5 py-2 text-sm font-bold text-black hover:bg-cream"
          >
            Retry
          </button>
        </div>
      )}
      {canLoadMore && <div ref={sentinelRef} aria-hidden="true" className="h-px" />}
    </>
  )
}