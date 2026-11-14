import { useRef, useState } from 'react'
import MovieCard from './MovieCard.jsx'
import { ChevronLeftIcon, ChevronRightIcon } from './icons.jsx'
import { useLoadMoreSentinel } from '../hooks/useLoadMoreSentinel.js'

// Pass `hasMore` + `onLoadMore` to make the row load further pages as the
// user scrolls it horizontally; without them it renders a fixed list.
export default function Row({
  title,
  items,
  loading,
  error,
  onRetry,
  size,
  hasMore = false,
  loadingMore = false,
  loadMoreError = null,
  onLoadMore,
}) {
  const railRef = useRef(null)
  const [showButtons, setShowButtons] = useState(false)
  const canLoadMore = Boolean(onLoadMore) && hasMore && !loading && !error
  const sentinelRef = useLoadMoreSentinel({
    onLoadMore,
    enabled: canLoadMore && !loadingMore && !loadMoreError,
    rootRef: railRef,
    // Start fetching roughly three cards before the end of the rail.
    rootMargin: '0px 800px 0px 0px',
  })

  const scrollBy = (dir) => {
    const rail = railRef.current
    if (!rail) return
    const delta = dir * Math.max(rail.clientWidth * 0.85, 320)
    rail.scrollBy({ left: delta, behavior: 'smooth' })
  }

  return (
    <section
      className="relative -mx-1 px-4 sm:px-6 lg:px-10"
      onMouseEnter={() => setShowButtons(true)}
      onMouseLeave={() => setShowButtons(false)}
    >
      <h2 className="mb-3 pl-1 text-lg font-bold text-cream sm:text-xl">{title}</h2>

      <div className="relative">
        {/* Arrows */}
        {showButtons && items && items.length > 0 && (
          <>
            <button
              onClick={() => scrollBy(-1)}
              className="absolute left-0 top-0 z-30 flex h-full w-10 items-center justify-center bg-ink/60 text-white opacity-90 transition hover:bg-ink/75 sm:w-12"
              aria-label="Scroll left"
            >
              <ChevronLeftIcon className="h-8 w-8" />
            </button>
            <button
              onClick={() => scrollBy(1)}
              className="absolute right-0 top-0 z-30 flex h-full w-10 items-center justify-center bg-ink/60 text-white opacity-90 transition hover:bg-ink/75 sm:w-12"
              aria-label="Scroll right"
            >
              <ChevronRightIcon className="h-8 w-8" />
            </button>
          </>
        )}

        <div
          ref={railRef}
          className="no-scrollbar flex gap-3 overflow-x-auto scroll-smooth py-5"
        >
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)
            : items && items.length > 0
              ? items.map((m) => <MovieCard key={m.key} media={m} size={size} />)
              : null}
          {loadingMore && Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={`more-${i}`} />)}
          {loadMoreError && !loadingMore && <LoadMoreRetry onRetry={onLoadMore} />}
          {canLoadMore && <div ref={sentinelRef} aria-hidden="true" className="w-px shrink-0" />}
        </div>
      </div>

      {error && !loading && <ErrorHint onRetry={onRetry} />}
      {!loading && !error && items && items.length === 0 && (
        <p className="px-1 py-4 text-sm text-mist">Nothing here yet.</p>
      )}
    </section>
  )
}

function ErrorHint({ onRetry }) {
  return (
    <div className="px-1 py-2">
      <p className="text-sm text-red-400">Couldn't load this row. {onRetry && (<button onClick={onRetry} className="ml-1 font-semibold underline">Retry</button>)}</p>
    </div>
  )
}

function LoadMoreRetry({ onRetry }) {
  return (
    <div className="flex aspect-[2/3] w-[230px] shrink-0 flex-col items-center justify-center gap-3 rounded-lg border border-white/10 bg-surface p-4 text-center">
      <p className="text-sm text-red-400">Couldn't load more.</p>
      <button
        onClick={onRetry}
        className="rounded bg-white px-4 py-1.5 text-xs font-bold text-black hover:bg-cream"
      >
        Retry
      </button>
    </div>
  )
}

function CardSkeleton() {
  return <div className="skeleton aspect-[2/3] w-[230px] shrink-0 rounded-lg" />
}