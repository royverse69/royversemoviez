import { API_BASE, IMG_BASE, requests } from '../data/requests.js'

// Public TMDB key baked in at build/deploy time so users need no setup.
// VITE_TMDB_API_KEY and the in-app Settings page can override it.
const BUILT_IN_TMDB_API_KEY = '18f62ff5a3f8af9b581bda514dd9dfd6'

let tmdbApiKey = import.meta.env.VITE_TMDB_API_KEY?.trim() || BUILT_IN_TMDB_API_KEY

export const setTmdbApiKey = (value) => {
  tmdbApiKey = String(value || '').trim()
}

export const getTmdbApiKey = () => tmdbApiKey
export const hasApiKey = () => Boolean(tmdbApiKey)

export const POSTER_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750"><rect width="100%" height="100%" fill="#1c1c1c"/><g fill="#e50914" transform="translate(250,375)"><rect x="-34" y="-22" width="12" height="44" rx="2"/><rect x="-14" y="-14" width="12" height="36" rx="2"/><rect x="6" y="-26" width="12" height="52" rx="2"/><rect x="26" y="-8" width="12" height="34" rx="2"/></g><text x="0" y="488" font-family="sans-serif" font-size="34" fill="#4a4a4a" text-anchor="middle">RoyverseMoviez</text></svg>`
  )

const isAbsoluteUrl = (value) => {
  try {
    const parsed = new URL(String(value || ''))
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export const backdropUrl = (path) =>
  path ? (isAbsoluteUrl(path) ? path : `${IMG_BASE}/w1280${path}`) : null
export const originalBackdropUrl = (path) =>
  path ? (isAbsoluteUrl(path) ? path : `${IMG_BASE}/original${path}`) : null
export const posterUrl = (path, size = 'w500') =>
  path ? (isAbsoluteUrl(path) ? path : `${IMG_BASE}/${size}${path}`) : POSTER_PLACEHOLDER
export const stillUrl = (path, size = 'w500') =>
  path ? (isAbsoluteUrl(path) ? path : `${IMG_BASE}/${size}${path}`) : null

export const videosPath = (mediaType, id) =>
  `${mediaType === 'tv' ? '/tv' : '/movie'}/${id}/videos`

function usesV4AccessToken(value) {
  const token = String(value || '').trim()
  // TMDB v4 Read Access Tokens are long JWT-style credentials; v3 API keys are 32 characters.
  return token.length > 80 || token.split('.').length === 3
}

function requestAuth(key) {
  return usesV4AccessToken(key)
    ? { headers: { Authorization: `Bearer ${key}` } }
    : { queryKey: key }
}

async function request(path, params = {}) {
  const credential = tmdbApiKey
  if (!credential) {
    throw new Error('TMDB is not configured. Add a v3 API key or v4 Read Access Token in Settings.')
  }

  const url = new URL(`${API_BASE}${path}`)
  url.searchParams.set('language', 'en-US')
  const auth = requestAuth(credential)
  if (auth.queryKey) url.searchParams.set('api_key', auth.queryKey)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  })

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(url, {
      ...(auth.headers ? { headers: auth.headers } : {}),
      signal: controller.signal,
      cache: 'no-store',
    })
    const payload = await res.json().catch(() => null)
    if (!res.ok) {
      const detail = payload?.status_message || payload?.message
      if (res.status === 401 || res.status === 403) {
        throw new Error('TMDB authentication failed. Check the v3 API key or v4 Read Access Token in Settings.')
      }
      throw new Error(detail || `TMDB request failed (HTTP ${res.status}).`)
    }
    return payload
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('TMDB request timed out. Check your connection and try again.')
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function validateTmdbApiKey(value) {
  const credential = String(value || '').trim()
  if (!credential) return false

  const url = new URL(`${API_BASE}/configuration`)
  const auth = requestAuth(credential)
  if (auth.queryKey) url.searchParams.set('api_key', auth.queryKey)
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(url, {
      ...(auth.headers ? { headers: auth.headers } : {}),
      signal: controller.signal,
      cache: 'no-store',
    })
    return response.ok
  } finally {
    window.clearTimeout(timeout)
  }
}

// TMDB refuses page numbers above 500 regardless of total_pages.
const TMDB_MAX_PAGE = 500

// Unrated titles (vote_average 0) have no provider streams — drop them
// from browse surfaces. Search opts in via includeUnrated.
const filterRated = (results, includeUnrated) =>
  includeUnrated ? results || [] : (results || []).filter((item) => (item.vote_average || 0) > 0)

export const api = {
  list: (path, params, { includeUnrated = false } = {}) =>
    request(path, params).then((r) => filterRated(r.results, includeUnrated)),
  // Paged variant for infinite scrolling: also reports whether another page exists.
  page: (path, page = 1, params, { includeUnrated = false } = {}) =>
    request(path, { ...params, page }).then((r) => {
      const totalPages = Math.min(r.total_pages || 1, TMDB_MAX_PAGE)
      return {
        results: filterRated(r.results, includeUnrated),
        hasMore: (r.page || page) < totalPages,
      }
    }),
  genres: () =>
    Promise.all([request(requests.genresMovie), request(requests.genresTv)]).then(
      ([movieGenres, tvGenres]) => {
        const map = new Map()
        ;[...movieGenres.genres, ...tvGenres.genres].forEach((g) => map.set(g.id, g.name))
        return map
      }
    ),
  detail: (mediaType, id) => request(`${mediaType === 'tv' ? '/tv' : '/movie'}/${id}`),
  externalIds: (mediaType, id) => request(`${mediaType === 'tv' ? '/tv' : '/movie'}/${id}/external_ids`),
  watchProviders: (mediaType, id) => request(`${mediaType === 'tv' ? '/tv' : '/movie'}/${id}/watch/providers`),
  findByExternalId: (externalId, source = 'imdb_id') => request(`/find/${encodeURIComponent(externalId)}`, { external_source: source }),
  images: (mediaType, id) => request(`${mediaType === 'tv' ? '/tv' : '/movie'}/${id}/images`, { include_image_language: 'en,null' }),
  season: (id, seasonNumber) => request(`/tv/${id}/season/${seasonNumber}`),
  credits: (mediaType, id) => request(`${mediaType === 'tv' ? '/tv' : '/movie'}/${id}/credits`),
  videos: async (mediaType, id) => {
    const data = await request(videosPath(mediaType, id))
    const list = data.results || []
    const trailer =
      list.find(
        (v) =>
          v.site === 'YouTube' &&
          v.official &&
          ['Trailer', 'Teaser'].includes(v.type)
      ) ||
      list.find((v) => v.site === 'YouTube' && v.type === 'Trailer') ||
      list.find((v) => v.site === 'YouTube')
    return trailer ? `https://www.youtube.com/embed/${trailer.key}?autoplay=1` : null
  },
}
