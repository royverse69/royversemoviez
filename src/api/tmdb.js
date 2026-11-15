import { API_BASE, IMG_BASE, requests } from '../data/requests.js'
import { getDownloadApiBaseUrl } from './downloadApi.js'

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

async function fetchJsonWithTimeout(url, headers = {}, timeoutMs = 10000) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const detail = payload?.status_message || payload?.message
      const error = new Error(
        response.status === 401 || response.status === 403
          ? 'TMDB authentication failed. Check the v3 API key or v4 Read Access Token in Settings.'
          : detail || `TMDB request failed (HTTP ${response.status}).`
      )
      error.status = response.status
      throw error
    }
    return payload
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('TMDB connection timed out.')
      timeoutError.networkFailure = true
      throw timeoutError
    }
    if (error instanceof TypeError) {
      const networkError = new Error('Could not connect to TMDB.')
      networkError.networkFailure = true
      throw networkError
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

function makeProxyUrl(path, directUrl) {
  const backend = getDownloadApiBaseUrl()
  if (!backend) return null

  const cleanPath = String(path || '').split('/').filter(Boolean).join('/')
  let backendBase = String(backend).trim()
  while (backendBase.endsWith('/')) backendBase = backendBase.slice(0, -1)

  const proxyUrl = new URL(`tmdb/${cleanPath}`, `${backendBase}/`)
  directUrl.searchParams.forEach((value, key) => proxyUrl.searchParams.set(key, value))
  return proxyUrl
}

async function fetchTmdb(path, directUrl, headers = {}, timeoutMs = 10000) {
  try {
    return await fetchJsonWithTimeout(directUrl, headers, timeoutMs)
  } catch (directError) {
    // Invalid credentials are not a network problem; all other connection/upstream
    // failures can be retried from the backend's network instead of the visitor's ISP.
    const retryable =
      directError?.networkFailure || directError?.status >= 500 || directError?.status === 429
    const proxyUrl = retryable ? makeProxyUrl(path, directUrl) : null

    if (!proxyUrl) {
      if (directError?.networkFailure) {
        throw new Error(
          'The browser cannot reach api.themoviedb.org. Configure the Download Backend URL in Settings to retry TMDB through the server.'
        )
      }
      throw directError
    }

    try {
      return await fetchJsonWithTimeout(proxyUrl, headers, 18000)
    } catch (proxyError) {
      throw new Error(
        `TMDB direct connection failed and the server proxy could not complete the request: ${proxyError.message}`
      )
    }
  }
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

  return fetchTmdb(path, url, auth.headers || {}, 8000)
}

export async function validateTmdbApiKey(value) {
  const credential = String(value || '').trim()
  if (!credential) return false

  const url = new URL(`${API_BASE}/configuration`)
  const auth = requestAuth(credential)
  if (auth.queryKey) url.searchParams.set('api_key', auth.queryKey)
  try {
    await fetchTmdb('/configuration', url, auth.headers || {}, 8000)
    return true
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) return false
    throw error
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
