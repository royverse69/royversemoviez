import { useCallback, useEffect, useRef, useState } from 'react'
import { uniqueByKey } from '../data/media.js'

const INITIAL = {
  items: null,
  page: 0,
  hasMore: false,
  loading: true,
  loadingMore: false,
  error: null,
  loadMoreError: null,
}

// Accumulates pages from `fetchPage(page) -> { items, hasMore }` for
// infinite scrolling. Resets whenever `deps` change; responses from a
// previous deps generation are ignored.
export function usePagedData(fetchPage, deps = []) {
  const [state, setState] = useState(INITIAL)
  const [tick, setTick] = useState(0)
  const generationRef = useRef(0)
  const inFlightRef = useRef(false)
  const fetchRef = useRef(fetchPage)
  fetchRef.current = fetchPage
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const generation = ++generationRef.current
    inFlightRef.current = true
    setState(INITIAL)
    fetchRef.current(1)
      .then(({ items, hasMore }) => {
        if (generation !== generationRef.current) return
        setState({ ...INITIAL, items: uniqueByKey(items), page: 1, hasMore, loading: false })
      })
      .catch((error) => {
        if (generation !== generationRef.current) return
        setState({ ...INITIAL, loading: false, error })
      })
      .finally(() => {
        if (generation === generationRef.current) inFlightRef.current = false
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const loadMore = useCallback(() => {
    const current = stateRef.current
    if (inFlightRef.current || !current.hasMore || current.loading || current.error) return
    const generation = generationRef.current
    const nextPage = current.page + 1
    inFlightRef.current = true
    setState((s) => ({ ...s, loadingMore: true, loadMoreError: null }))
    fetchRef.current(nextPage)
      .then(({ items, hasMore }) => {
        if (generation !== generationRef.current) return
        setState((s) => ({
          ...s,
          items: uniqueByKey([...(s.items || []), ...items]),
          page: nextPage,
          hasMore,
          loadingMore: false,
        }))
      })
      .catch((loadMoreError) => {
        if (generation !== generationRef.current) return
        setState((s) => ({ ...s, loadingMore: false, loadMoreError }))
      })
      .finally(() => {
        if (generation === generationRef.current) inFlightRef.current = false
      })
  }, [])

  const retry = useCallback(() => setTick((t) => t + 1), [])

  return { ...state, loadMore, retry }
}
