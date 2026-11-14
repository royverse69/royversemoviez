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
export const ROW_SOURCES = [
  trendingSource('Trending Now'),
  pathSource('Popular Movies', requests.popularMovies),
  pathSource('Top Rated', requests.topRatedMovies),
  pathSource('Popular Series', requests.popularTv),
  pathSource('Now Playing', requests.nowPlaying),
]

// Country-filtered variants replace the global rows entirely when a
// country is selected (trending can't be region-filtered on TMDB).
export function getRowSources(country) {
  if (!country) return ROW_SOURCES
  const name = countryName(country)
  return [
    countryTrendingSource(`Popular in ${name}`, country),
    discoverSource(`Popular Movies from ${name}`, 'movie', country, { sort_by: 'popularity.desc' }),
    discoverSource(`Top Rated Movies from ${name}`, 'movie', country, { sort_by: 'vote_average.desc', 'vote_count.gte': 200 }),
    discoverSource(`Popular Series from ${name}`, 'tv', country, { sort_by: 'popularity.desc' }),
    discoverSource(`Top Rated Series from ${name}`, 'tv', country, { sort_by: 'vote_average.desc', 'vote_count.gte': 100 }),
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

export async function searchMedia(query, page = 1) {
  if (!hasApiKey()) return mockSearch(query)
  const [movies, shows] = await Promise.all([
    api.list(requests.searchMovie, { query, page, include_adult: false }, { includeUnrated: true }),
    api.list(requests.searchTv, { query, page, include_adult: false }, { includeUnrated: true }),
  ])
  const all = [...movies.map((m) => normalizeMedia(m, 'movie')), ...shows.map((s) => normalizeMedia(s, 'tv'))]
  return sortByPopularity(uniqueByKey(all))
}

export async function getVideo(mediaType, id) {
  if (!hasApiKey()) return mockVideos()
  return api.videos(mediaType, id)
}

export async function getDetails(mediaType, id) {
  if (!hasApiKey()) return getMockMedia().find((m) => String(m.id) === String(id)) || null
  const raw = await api.detail(mediaType, id)
  return normalizeMedia(raw, mediaType)
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
