import { api, hasApiKey } from './tmdb.js'
import { requests } from '../data/requests.js'
import { normalizeMedia, sortByPopularity, uniqueByKey } from '../data/media.js'
import { countryName } from '../data/countries.js'
import {
  getMockMedia,
  mockSearch,
  mockGenres,
  mockVideos,
  mockRow,
} from '../data/mock.js'

export const isLive = () => hasApiKey()

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// Paged fetchers. Each returns { items, hasMore } for one TMDB page so rows
// and grids can keep loading as the user scrolls.
// ---------------------------------------------------------------------------

async function pathPage(path, page) {
  const mediaType = path.includes('/tv') ? 'tv' : 'movie'
  const { results, hasMore } = await api.page(path, page)
  return { items: results.map((r) => normalizeMedia(r, mediaType)), hasMore }
}

async function trendingPage(mediaType, page) {
  const { results, hasMore } = await api.page(
    mediaType ? `/trending/${mediaType}/week` : requests.trending,
    page
  )
  return { items: uniqueByKey(results.map((r) => normalizeMedia(r, mediaType))), hasMore }
}

// Discover content produced in a country (TMDB `with_origin_country`),
// sorted by popularity — the closest country equivalent of "trending".
async function countryTrendingPage(country, mediaType, page) {
  const types = mediaType ? [mediaType] : ['movie', 'tv']
  const pages = await Promise.all(
    types.map((type) =>
      api.page(`/discover/${type}`, page, {
        with_origin_country: country,
        sort_by: 'popularity.desc',
        include_adult: false,
      })
    )
  )
  const all = pages.flatMap((p, i) => p.results.map((r) => normalizeMedia(r, types[i])))
  return { items: sortByPopularity(uniqueByKey(all)), hasMore: pages.some((p) => p.hasMore) }
}

async function discoverPage(mediaType, country, params, page) {
  const { results, hasMore } = await api.page(`/discover/${mediaType}`, page, {
    with_origin_country: country,
    include_adult: false,
    ...params,
  })
  return { items: results.map((r) => normalizeMedia(r, mediaType)), hasMore }
}

const mockByType = (mediaType) => () =>
  mediaType ? getMockMedia().filter((m) => m.mediaType === mediaType) : getMockMedia()

// A row/grid source: `fetchPage(page)` resolves to { items, hasMore }.
// Without an API key the mock catalog is served as a single page.
function pagedSource(label, fetchLive, mock = () => mockRow(label)) {
  return {
    label,
    fetchPage: (page = 1) => {
      if (!hasApiKey()) return Promise.resolve({ items: page === 1 ? mock() : [], hasMore: false })
      return fetchLive(page)
    },
  }
}

const trendingSource = (label, mediaType) =>
  pagedSource(label, (page) => trendingPage(mediaType, page), mockByType(mediaType))
const pathSource = (label, path) => pagedSource(label, (page) => pathPage(path, page))
const countryTrendingSource = (label, country, mediaType) =>
  pagedSource(label, (page) => countryTrendingPage(country, mediaType, page), mockByType(mediaType))
const discoverSource = (label, mediaType, country, params) =>
  pagedSource(label, (page) => discoverPage(mediaType, country, params, page), mockByType(mediaType))

export async function getTrending(mediaType, country) {
  if (!hasApiKey()) return mockByType(mediaType)()
  const { items } = country
    ? await countryTrendingPage(country, mediaType, 1)
    : await trendingPage(mediaType, 1)
  return items
}

// Rows for the home page.
const buildDiscoveryRows = (country) => {
  const label = country ? countryName(country) : null
  const origin = country || undefined
  return [
    discoverSource(label ? `Action & Adventure from ${label}` : 'Action & Adventure', 'movie', origin, { with_genres: '28,12', sort_by: 'popularity.desc' }),
    discoverSource(label ? `Comedy from ${label}` : 'Comedy Hits', 'movie', origin, { with_genres: '35', sort_by: 'popularity.desc' }),
    discoverSource(label ? `Crime & Mystery from ${label}` : 'Crime & Mystery', 'tv', origin, { with_genres: '80,9648', sort_by: 'popularity.desc' }),
    discoverSource(label ? `Sci-Fi & Fantasy from ${label}` : 'Sci-Fi & Fantasy', 'movie', origin, { with_genres: '878,14', sort_by: 'popularity.desc' }),
    discoverSource(label ? `Animation from ${label}` : 'Animation & Anime', 'tv', origin || 'JP', { with_genres: '16', sort_by: 'popularity.desc' }),
    discoverSource(label ? `Family from ${label}` : 'Family Night', 'movie', origin, { with_genres: '10751', sort_by: 'popularity.desc' }),
    discoverSource(label ? `Documentaries from ${label}` : 'Documentaries', 'movie', origin, { with_genres: '99', sort_by: 'popularity.desc' }),
    discoverSource(label ? `Romance from ${label}` : 'Romance', 'movie', origin, { with_genres: '10749', sort_by: 'popularity.desc' }),
    discoverSource('Indian Cinema', 'movie', 'IN', { sort_by: 'popularity.desc' }),
    discoverSource('Indian Series', 'tv', 'IN', { sort_by: 'popularity.desc' }),
  ]
}

export const ROW_SOURCES = [
  trendingSource('Trending Now'),
  pathSource('Popular Movies', requests.popularMovies),
  pathSource('Top Rated', requests.topRatedMovies),
  pathSource('Popular Series', requests.popularTv),
  pathSource('Now Playing', requests.nowPlaying),
  ...buildDiscoveryRows(''),
]

// Country-specific popular rows remain first, followed by genre collections.
export function getRowSources(country) {
  if (!country) return ROW_SOURCES
  const name = countryName(country)
  return [
    countryTrendingSource(`Popular in ${name}`, country),
    discoverSource(`Popular Movies from ${name}`, 'movie', country, { sort_by: 'popularity.desc' }),
    discoverSource(`Top Rated Movies from ${name}`, 'movie', country, { sort_by: 'vote_average.desc', 'vote_count.gte': 200 }),
    discoverSource(`Popular Series from ${name}`, 'tv', country, { sort_by: 'popularity.desc' }),
    discoverSource(`Top Rated Series from ${name}`, 'tv', country, { sort_by: 'vote_average.desc', 'vote_count.gte': 100 }),
    ...buildDiscoveryRows(country),
  ]
}

// First page of a source, for callers that only need a fixed list.
export async function getRow(source) {
  const { items } = await source.fetchPage(1)
  return items
}

export const MOVIES_ROW_SOURCES = [
  trendingSource('Trending Films', 'movie'),
  pathSource('Popular Movies', requests.popularMovies),
  pathSource('Top Rated', requests.topRatedMovies),
  pathSource('Now Playing', requests.nowPlaying),
]

export function getMoviesRowSources(country) {
  if (!country) return MOVIES_ROW_SOURCES
  const name = countryName(country)
  return [
    discoverSource(`Popular Movies from ${name}`, 'movie', country, { sort_by: 'popularity.desc' }),
    discoverSource(`Top Rated Movies from ${name}`, 'movie', country, { sort_by: 'vote_average.desc', 'vote_count.gte': 200 }),
    discoverSource(`New Movies from ${name}`, 'movie', country, { 'primary_release_date.lte': today(), 'primary_release_date.gte': daysAgo(365), sort_by: 'popularity.desc' }),
  ]
}

export const SERIES_ROW_SOURCES = [
  trendingSource('Trending Series', 'tv'),
  pathSource('Popular Series', requests.popularTv),
  pathSource('Top Rated Series', requests.topRatedTv),
]

export function getSeriesRowSources(country) {
  if (!country) return SERIES_ROW_SOURCES
  const name = countryName(country)
  return [
    discoverSource(`Popular Series from ${name}`, 'tv', country, { sort_by: 'popularity.desc' }),
    discoverSource(`Top Rated Series from ${name}`, 'tv', country, { sort_by: 'vote_average.desc', 'vote_count.gte': 100 }),
    discoverSource(`New Series from ${name}`, 'tv', country, { 'first_air_date.lte': today(), 'first_air_date.gte': daysAgo(365), sort_by: 'popularity.desc' }),
  ]
}

// The full catalog for one media type (optionally limited to a country),
// used by the infinite "All Movies" / "All Series" grid.
export function getCatalogSource(mediaType, country) {
  const name = country ? countryName(country) : null
  const noun = mediaType === 'tv' ? 'Series' : 'Movies'
  return discoverSource(
    name ? `All ${noun} from ${name}` : `All ${noun}`,
    mediaType,
    country || undefined,
    // A vote floor keeps obscure regional daytime shows out of the global
    // grid; it's lowered for a single country so small markets still fill it.
    { sort_by: 'popularity.desc', 'vote_count.gte': country ? 10 : 50 }
  )
}

export async function getGenres() {
  if (!hasApiKey()) return mockGenres()
  return api.genres()
}

export async function getDiscoverByGenre(genreId, page = 1) {
  if (!hasApiKey()) return getMockMedia().slice(0, 12)
  const raw = await api.list(requests.discover, {
    with_genres: genreId,
    sort_by: 'popularity.desc',
    page,
    include_adult: false,
  })
  return raw.map((r) => normalizeMedia(r, 'movie'))
}

export async function getGenreTitles(genreId, page = 1) {
  if (!hasApiKey()) return getMockMedia().slice(0, 12)
  const [movies, shows] = await Promise.all([
    api.list(requests.discover, {
      with_genres: genreId,
      sort_by: 'popularity.desc',
      page,
    }),
    api.list('/discover/tv', {
      with_genres: genreId,
      sort_by: 'popularity.desc',
      page,
    }),
  ])
  const all = [...movies.map((m) => normalizeMedia(m, 'movie')), ...shows.map((s) => normalizeMedia(s, 'tv'))]
  return sortByPopularity(uniqueByKey(all))
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 6500) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`Request failed (${response.status})`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

async function searchOmdbTitles(query, apiKey, page = 1) {
  if (!apiKey) return []
  const url = new URL('https://www.omdbapi.com/')
  url.searchParams.set('apikey', apiKey)
  url.searchParams.set('s', query)
  url.searchParams.set('type', 'movie')
  url.searchParams.set('page', String(page))
  const body = await fetchJsonWithTimeout(url.toString())
  if (body.Response === 'False') return []
  return (body.Search || []).map((item) => ({
    imdbId: item.imdbID,
    title: item.Title,
    mediaType: 'movie',
  })).filter((item) => item.imdbId)
}

async function searchTvmazeTitles(query) {
  const url = new URL('https://api.tvmaze.com/search/shows')
  url.searchParams.set('q', query)
  const body = await fetchJsonWithTimeout(url.toString(), {
    headers: { accept: 'application/json' },
  })
  return (body || []).slice(0, 8).map((item) => ({
    imdbId: item.show?.externals?.imdb,
    title: item.show?.name,
    mediaType: 'tv',
  })).filter((item) => item.imdbId)
}

async function resolveFallbackTitles(candidates) {
  const uniqueCandidates = [...new Map(candidates.map((item) => [item.imdbId, item])).values()]
  const resolved = await Promise.all(uniqueCandidates.slice(0, 10).map(async (candidate) => {
    try {
      const found = await api.findByExternalId(candidate.imdbId)
      const matches = [
        ...(found.movie_results || []).map((item) => normalizeMedia({ ...item, imdb_id: candidate.imdbId }, 'movie')),
        ...(found.tv_results || []).map((item) => normalizeMedia({ ...item, imdb_id: candidate.imdbId }, 'tv')),
      ]
      return matches
    } catch {
      return []
    }
  }))
  return sortByPopularity(uniqueByKey(resolved.flat()))
}

async function searchTraktTitles(query, clientId, page = 1) {
  if (!clientId) throw new Error('Trakt Client ID is not configured')
  const url = new URL('https://api.trakt.tv/search/movie,show')
  url.searchParams.set('query', query)
  url.searchParams.set('page', String(page))
  url.searchParams.set('limit', '10')
  const rows = await fetchJsonWithTimeout(url.toString(), {
    headers: {
      'trakt-api-version': '2',
      'trakt-api-key': clientId,
      accept: 'application/json',
    },
  })
  const candidates = (rows || []).map((row) => {
    const type = row.type === 'show' ? 'tv' : row.type === 'movie' ? 'movie' : null
    const item = type === 'tv' ? row.show : row.movie
    const tmdbId = item?.ids?.tmdb
    if (!type || !tmdbId) return null
    const title = item.title || item.name || 'Untitled'
    const date = item.year ? String(item.year) : ''
    return {
      id: String(tmdbId),
      key: `${type}-${tmdbId}`,
      mediaType: type,
      title,
      overview: '',
      backdrop: null,
      poster: null,
      rating: Number(item.rating) || 0,
      votes: 0,
      date,
      year: date,
      genreIds: [],
      popularity: Number(row.score) || 0,
      genres: [],
      runtime: null,
      seasons: null,
      numberOfEpisodes: null,
      imdbId: item.ids?.imdb || null,
    }
  }).filter(Boolean)
  if (!candidates.length) throw new Error('Trakt returned no TMDB-linked titles')
  return sortByPopularity(uniqueByKey(candidates))
}

const STREAMX_BASES = [
  'https://api.streamx.qzz.io',
  'https://streamx-api.pages.dev',
]

async function fetchFastestStreamXSearch(query, mediaType, page = 1) {
  const type = mediaType === 'tv' ? 'series' : 'movie'
  const skip = Math.max(0, (page - 1) * 10)
  const requests = STREAMX_BASES.map(async (base) => {
    const url = new URL('/search', base)
    url.searchParams.set('q', query)
    url.searchParams.set('type', type)
    url.searchParams.set('skip', String(skip))
    const data = await fetchJsonWithTimeout(url.toString(), {}, 6500)
    if (!Array.isArray(data.metas) || data.metas.length === 0) throw new Error('StreamX returned no matching titles')
    return { base, metas: data.metas }
  })
  const result = await Promise.any(requests)
  return result
}

async function searchStreamXTitles(query, page = 1) {
  const [movieSearch, seriesSearch] = await Promise.allSettled([
    fetchFastestStreamXSearch(query, 'movie', page),
    fetchFastestStreamXSearch(query, 'tv', page),
  ])
  const sources = [
    ...(movieSearch.status === 'fulfilled' ? [{ ...movieSearch.value, type: 'movie' }] : []),
    ...(seriesSearch.status === 'fulfilled' ? [{ ...seriesSearch.value, type: 'series' }] : []),
  ]
  if (!sources.length) throw new Error('StreamX search endpoints are unavailable')

  const candidates = sources.flatMap((source) =>
    source.metas.slice(0, 6).map((item) => ({ ...item, sourceBase: source.base, sourceType: source.type }))
  )

  const mapped = await Promise.all(candidates.map(async (item) => {
    const url = new URL(`/meta/${item.sourceType}/${encodeURIComponent(item.id)}`, item.sourceBase)
    url.searchParams.set('enrich', '1')
    try {
      const data = await fetchJsonWithTimeout(url.toString(), {}, 7500)
      const meta = data.meta || {}
      const tmdbId = meta.externalIds?.tmdb || meta.moviedb_id
      if (!tmdbId) return null
      const mediaType = item.sourceType === 'series' ? 'tv' : 'movie'
      const date = String(meta.releaseInfo || item.releaseInfo || '')
      return {
        id: String(tmdbId),
        key: `${mediaType}-${tmdbId}`,
        mediaType,
        title: meta.name || item.name || item.title || 'Untitled',
        overview: meta.description || '',
        backdrop: meta.images?.background?.large || meta.background || item.background || null,
        poster: meta.images?.poster?.medium || meta.poster || item.poster || null,
        rating: Number(meta.imdbRating ?? item.imdbRating) || 0,
        votes: 0,
        date,
        year: (date.match(/\\b(19|20)\\d{2}\\b/) || [])[0] || '',
        genreIds: [],
        popularity: Number(item.rank ? 100000 - item.rank : 0) || 0,
        genres: Array.isArray(meta.genres) ? meta.genres : Array.isArray(item.genres) ? item.genres : [],
        runtime: Number(meta.runtime) || null,
        seasons: Array.isArray(meta.seasons) ? meta.seasons.map((season, index) => ({
          season_number: Number(season.number ?? season.season ?? index + 1),
          name: season.name || `Season ${index + 1}`,
        })) : null,
        numberOfEpisodes: Array.isArray(meta.videos) ? meta.videos.length : null,
        imdbId: meta.externalIds?.imdb || item.id || null,
      }
    } catch {
      return null
    }
  }))

  const results = sortByPopularity(uniqueByKey(mapped.filter(Boolean)))
  if (!results.length) throw new Error('StreamX returned titles but none could be mapped to playable TMDB IDs')
  return results
}

export async function searchMedia(query, page = 1, { omdbApiKey = '', traktClientId = '' } = {}) {
  const cleanQuery = String(query || '').trim()
  if (!cleanQuery) return []
  if (!hasApiKey()) return mockSearch(cleanQuery)

  let primaryError
  try {
    const results = await api.list('/search/multi', {
      query: cleanQuery,
      page,
      include_adult: false,
    }, { includeUnrated: true })
    const titles = results
      .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
      .map((item) => normalizeMedia(item))
    if (titles.length) return sortByPopularity(uniqueByKey(titles))
  } catch (error) {
    primaryError = error
  }

  try {
    const [movies, shows] = await Promise.all([
      api.list(requests.searchMovie, { query: cleanQuery, page, include_adult: false }, { includeUnrated: true }),
      api.list(requests.searchTv, { query: cleanQuery, page, include_adult: false }, { includeUnrated: true }),
    ])
    const sameProvider = sortByPopularity(uniqueByKey([
      ...movies.map((item) => normalizeMedia(item, 'movie')),
      ...shows.map((item) => normalizeMedia(item, 'tv')),
    ]))
    if (sameProvider.length) return sameProvider
  } catch (error) {
    primaryError = error
  }

  // When TMDB's search endpoints fail, run independent sources in parallel.
  // The first source to return playable TMDB IDs wins, so the app adapts to
  // real-world response speed instead of assuming one static fallback is fastest.
  const fallbackTasks = [
    searchStreamXTitles(cleanQuery, page),
    searchTvmazeTitles(cleanQuery).then(resolveFallbackTitles),
    searchOmdbTitles(cleanQuery, omdbApiKey, page).then(resolveFallbackTitles),
  ]
  if (traktClientId) fallbackTasks.push(searchTraktTitles(cleanQuery, traktClientId, page))

  const fallbackErrors = []
  const attempts = fallbackTasks.map((task) => task.then((results) => {
    if (!Array.isArray(results) || !results.length) throw new Error('No playable titles returned')
    return results
  }).catch((error) => {
    fallbackErrors.push(error?.message || String(error))
    throw error
  }))
  try {
    return await Promise.any(attempts)
  } catch {
    const detail = fallbackErrors.length ? ` Fallbacks: ${fallbackErrors.join('; ')}.` : ''
    throw new Error(`The catalogue search is unavailable. No metadata provider returned a playable title.${detail} ${primaryError?.message || ''}`.trim())
  }
}

export async function getVideo(mediaType, id) {
  if (!hasApiKey()) return mockVideos()
  return api.videos(mediaType, id)
}

export async function getDetails(mediaType, id) {
  if (!hasApiKey()) return getMockMedia().find((m) => String(m.id) === String(id)) || null
  const [raw, externalIds] = await Promise.all([
    api.detail(mediaType, id),
    api.externalIds(mediaType, id).catch(() => ({})),
  ])
  return normalizeMedia({ ...raw, external_ids: externalIds }, mediaType)
}

export async function getWatchProviders(mediaType, id, country) {
  if (!hasApiKey() || !country) return null
  const response = await api.watchProviders(mediaType, id)
  const region = response?.results?.[country]
  if (!region) return null
  const unique = new Map()
  for (const key of ['flatrate', 'free', 'ads', 'rent', 'buy']) {
    for (const provider of region[key] || []) unique.set(provider.provider_id, provider)
  }
  return {
    link: region.link || null,
    providers: [...unique.values()].sort((a, b) => (a.display_priority || 999) - (b.display_priority || 999)),
  }
}

export async function getOmdbDetails(imdbId, apiKey) {
  if (!imdbId || !apiKey) return null
  const url = new URL('https://www.omdbapi.com/')
  url.searchParams.set('apikey', apiKey)
  url.searchParams.set('i', imdbId)
  url.searchParams.set('plot', 'short')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`OMDb request failed (${response.status})`)
  const result = await response.json()
  if (result.Response === 'False') return null
  return {
    imdbId: result.imdbID || imdbId,
    rating: result.imdbRating && result.imdbRating !== 'N/A' ? result.imdbRating : null,
    votes: result.imdbVotes && result.imdbVotes !== 'N/A' ? result.imdbVotes : null,
    rated: result.Rated && result.Rated !== 'N/A' ? result.Rated : null,
    awards: result.Awards && result.Awards !== 'N/A' ? result.Awards : null,
    plot: result.Plot && result.Plot !== 'N/A' ? result.Plot : null,
    genre: result.Genre && result.Genre !== 'N/A' ? result.Genre : null,
  }
}

export async function getBackdrops(mediaType, id, limit = 5) {
  if (!hasApiKey()) return []
  const images = await api.images(mediaType, id).catch(() => ({ backdrops: [] }))
  return (images.backdrops || [])
    .filter((image) => image.file_path)
    .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
    .slice(0, limit)
    .map((image) => image.file_path)
}

export async function getRelated(mediaType, id, limit = 12) {
  if (!hasApiKey()) {
    const current = getMockMedia().find((media) => String(media.id) === String(id))
    return getMockMedia()
      .filter((media) => media.key !== current?.key)
      .sort((a, b) => {
        const aMatches = a.genreIds.filter((genre) => current?.genreIds.includes(genre)).length
        const bMatches = b.genreIds.filter((genre) => current?.genreIds.includes(genre)).length
        return bMatches - aMatches || b.popularity - a.popularity
      })
      .slice(0, limit)
  }

  let raw = await api.list(`/${mediaType}/${id}/recommendations`)
  if (!raw.length) raw = await api.list(`/${mediaType}/${id}/similar`)
  return raw.slice(0, limit).map((item) => normalizeMedia(item, mediaType))
}

export async function getSeasonEpisodes(id, seasonNumber) {
  if (!hasApiKey()) return []

  const season = await api.season(id, seasonNumber)
  return (season.episodes || []).map((episode) => ({
    id: episode.id,
    number: episode.episode_number,
    season: episode.season_number,
    title: episode.name || `Episode ${episode.episode_number}`,
    overview: episode.overview || '',
    still: episode.still_path || null,
    airDate: episode.air_date || '',
    runtime: episode.runtime || null,
  }))
}

export async function getCast(mediaType, id, limit = 20) {
  if (!hasApiKey()) return []
  const credits = await api.credits(mediaType, id).catch(() => ({ cast: [] }))
  return (credits.cast || [])
    .slice(0, limit)
    .map((p) => ({
      id: p.id,
      name: p.name,
      character: p.character || '',
      profile: p.profile_path || null,
    }))
}

export async function getNewReleases(mediaType, limit = 20) {
  if (!hasApiKey()) return getMockMedia().slice(0, limit)
  const path = mediaType === 'tv' ? '/discover/tv' : requests.discover
  const raw = await api.list(path, {
    sort_by: 'primary_release_date.desc',
    'primary_release_date.lte': new Date().toISOString().slice(0, 10),
    page: 1,
    include_adult: false,
    ...(mediaType === 'tv' ? { 'first_air_date.lte': new Date().toISOString().slice(0, 10) } : {}),
  })
  return raw.slice(0, limit).map((r) => normalizeMedia(r, mediaType))
}

export async function getRecommendationsForHistory(historyItems, limit = 20) {
  if (!historyItems?.length) return []
  const recent = historyItems.find((h) => h.mediaType === 'tv') || historyItems.find((h) => h.mediaType === 'movie') || historyItems[0]
  if (!recent) return []
  try {
    return await getRelated(recent.mediaType, recent.id, limit)
  } catch {
    return []
  }
}
