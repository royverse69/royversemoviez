import { useEffect, useRef } from 'react'

// Returns a ref for a sentinel element; calls `onLoadMore` when it comes
// within `rootMargin` of `rootRef` (or the viewport when omitted).
// The observer is rebuilt each time `enabled` flips back on (e.g. after a
// page finishes loading), so a sentinel that's still visible fires again.
export function useLoadMoreSentinel({ onLoadMore, enabled, rootRef, rootMargin = '0px' }) {
  const sentinelRef = useRef(null)
  const callbackRef = useRef(onLoadMore)
  callbackRef.current = onLoadMore

  useEffect(() => {
    const el = sentinelRef.current
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callbackRef.current?.()
      },
      { root: rootRef?.current ?? null, rootMargin }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled, rootRef, rootMargin])

  return sentinelRef
}
