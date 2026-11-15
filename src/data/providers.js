// CineSrc is the primary provider; the other embeds remain manual fallbacks.
export const PROVIDERS = [
  {
    id: 'cinesrc',
    name: 'CineSrc (Primary)',
    movie: (id) => `https://cinesrc.st/embed/movie/${encodeURIComponent(id)}?color=%23e50914`,
    tv: (id, season, episode) => `https://cinesrc.st/embed/tv/${encodeURIComponent(id)}?s=${season}&e=${episode}&autonext=false&color=%23e50914`,
    origin: 'https://cinesrc.st',
  },
  {
    id: 'moviebox-tui',
    name: 'MovieBox-TUI (External App)',
    externalApp: true,
  },
  {
    id: 'vidcore',
    name: 'VidCore (Backup)',
    movie: (id) => `https://vidcore.net/movie/${id}?autoPlay=true`,
    tv: (id, season, episode) => `https://vidcore.net/tv/${id}/${season}/${episode}?autoPlay=true`,
  },
  {
    id: 'vidfast',
    name: 'VidFast (Backup)',
    movie: (id) => `https://vidfast.vc/movie/${id}?autoPlay=true`,
    tv: (id, season, episode) => `https://vidfast.vc/tv/${id}/${season}/${episode}?autoPlay=true`,
  },
  {
    id: 'vidrock',
    name: 'VidRock (Backup)',
    movie: (id) => `https://vidrock.net/movie/${id}?autoplay=true`,
    tv: (id, season, episode) => `https://vidrock.net/tv/${id}/${season}/${episode}?autoplay=true`,
  },
]

export const DEFAULT_PROVIDER = 'cinesrc'
export const getProvider = (id) => PROVIDERS.find((provider) => provider.id === id) || PROVIDERS[0]

export function buildEmbedUrl(providerId, mediaType, id, season = 1, episode = 1) {
  const provider = getProvider(providerId)
  // MovieBox-TUI is a native companion app, not an embeddable web player.
  // Keep party/other iframe consumers on the normal primary web provider.
  if (provider.externalApp) {
    const fallback = getProvider(DEFAULT_PROVIDER)
    return mediaType === 'tv' ? fallback.tv(id, season, episode) : fallback.movie(id)
  }
  return mediaType === 'tv' ? provider.tv(id, season, episode) : provider.movie(id)
}
