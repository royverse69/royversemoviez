import { useState } from 'react'

function filenameFromUrl(value, title) {
  try {
    const path = decodeURIComponent(new URL(value).pathname.split('/').pop() || '')
    if (path && /\.[a-z0-9]{2,6}$/i.test(path)) {
      return path.replace(/[\\/:*?"<>|]/g, '_')
    }
  } catch {}
  const safeTitle = String(title || 'royverse-video').replace(/[\\/:*?"<>|]/g, '_').trim()
  return `${safeTitle || 'royverse-video'}.mp4`
}

export default function BrowserDownloadManager({ title = '' }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  const download = () => {
    setError('')
    let parsed
    try {
      parsed = new URL(url.trim())
    } catch {
      setError('Paste a direct download link first.')
      return
    }

    if (!['https:', 'http:'].includes(parsed.protocol)) {
      setError('Only HTTP and HTTPS download links are supported.')
      return
    }

    if (parsed.protocol === 'http:' && window.location.protocol === 'https:') {
      setError('Use an HTTPS download link on this secure website.')
      return
    }

    const link = document.createElement('a')
    link.href = parsed.href
    link.download = filenameFromUrl(parsed.href, title)
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <section className="w-full max-w-2xl rounded-xl border border-white/10 bg-[#111] p-4 text-white sm:p-5">
      {title && (
        <p className="mb-3 truncate text-xs font-semibold text-white/65">
          Selected title: <span className="text-white">{title}</span>
        </p>
      )}
      <label htmlFor="royverse-download-url" className="block text-xs font-bold text-white/80">
        Direct video download link
      </label>
      <input
        id="royverse-download-url"
        type="url"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={url}
        onChange={(event) => { setUrl(event.target.value); setError('') }}
        onKeyDown={(event) => { if (event.key === 'Enter') download() }}
        placeholder="https://example.com/video.mp4"
        className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-red-500"
      />
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      <button
        type="button"
        onClick={download}
        disabled={!url.trim()}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-5 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Download
      </button>
      <p className="mt-3 text-[10px] leading-5 text-white/45">
        Paste a direct MP4 or other downloadable file URL. The browser handles the transfer. Links inside third-party embedded players cannot be extracted by this page; some hosts may open the video instead of downloading it depending on their download headers.
      </p>
    </section>
  )
}
