import { useMemo } from 'react'
import { buildEmbedUrl } from '../data/providers.js'
import { useProvider } from '../context/ProviderContext.jsx'

export default function PlayerEmbed({ mediaType, id, season = 1, episode = 1, title, className = '', iframeRef }) {
  const { providerId } = useProvider()
  const src = useMemo(() => {
    const url = new URL(buildEmbedUrl(providerId, mediaType, id, season, episode))
    // Only the dedicated Watch page hides provider controls; it supplies its own control bar.
    if (providerId === 'cinesrc') url.searchParams.set('controls', 'false')
    return url.toString()
  }, [providerId, mediaType, id, season, episode])

  return (
    <iframe
      ref={iframeRef}
      key={src}
      src={src}
      title={title || 'Video player'}
      className={`absolute inset-0 h-full w-full border-0 bg-black ${className}`}
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
      allowFullScreen
      sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
      referrerPolicy="strict-origin"
      loading="eager"
    />
  )
}
