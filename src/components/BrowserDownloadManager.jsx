import { useCallback, useRef, useState } from 'react'

const MAX_WORKERS = 4
const MIN_PARALLEL_SIZE = 16 * 1024 * 1024

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`
}

function safeFilename(value) {
  return String(value || 'royverse-download')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 160) || 'royverse-download'
}

function filenameFromUrl(url) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
    return safeFilename(name && name.includes('.') ? name : 'royverse-download.mp4')
  } catch {
    return 'royverse-download.mp4'
  }
}

function filenameFromDisposition(value) {
  if (!value) return null
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const plain = value.match(/filename="?([^";]+)"?/i)?.[1]
  try {
    return safeFilename(decodeURIComponent(encoded || plain || ''))
  } catch {
    return safeFilename(plain || '')
  }
}

function parseRangeTotal(value) {
  const match = String(value || '').match(/bytes\s+\d+-\d+\/(\d+)/i)
  return match ? Number(match[1]) : 0
}

async function inspectDirectUrl(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Enter a complete download URL beginning with https://')
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP and HTTPS media links are supported.')
  }
  if (parsed.protocol === 'http:' && window.location.protocol === 'https:') {
    throw new Error('This page is secure (HTTPS), so the browser blocks insecure HTTP downloads. Use an HTTPS link.')
  }

  let head = null
  let headError = null
  try {
    head = await fetch(parsed.href, {
      method: 'HEAD',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      cache: 'no-store',
    })
  } catch (error) {
    headError = error
  }

  if (head && !head.ok && ![405, 501].includes(head.status)) {
    throw new Error(`The source returned HTTP ${head.status} to a HEAD request.`)
  }

  let total = Number(head?.headers.get('content-length')) || 0
  let contentType = head?.headers.get('content-type') || ''
  let filename = filenameFromDisposition(head?.headers.get('content-disposition')) || filenameFromUrl(parsed.href)
  let etag = head?.headers.get('etag') || ''
  let rangeSupported = false

  // Probe one byte. Range support is required for reliable pause/resume and parallel chunks.
  try {
    const probe = await fetch(parsed.href, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      cache: 'no-store',
    })
    contentType = probe.headers.get('content-type') || contentType
    filename = filenameFromDisposition(probe.headers.get('content-disposition')) || filename
    etag = probe.headers.get('etag') || etag
    const rangeTotal = parseRangeTotal(probe.headers.get('content-range'))
    if (probe.status === 206) {
      rangeSupported = true
      if (rangeTotal > 0) total = rangeTotal
      else if (!total) rangeSupported = false
    } else if (probe.status !== 200) {
      await probe.body?.cancel().catch(() => {})
      throw new Error(`The source rejected the download probe (HTTP ${probe.status}).`)
    }
    await probe.body?.cancel().catch(() => {})
  } catch (error) {
    if (error instanceof TypeError || /fetch|network|cors/i.test(error?.message || '')) {
      if (!head || headError) {
        throw new Error('The source blocked browser access (CORS or network policy). A browser downloader cannot read this link unless its server permits cross-origin requests.')
      }
      // A HEAD may succeed while a range probe is blocked. A normal single-stream
      // download may still work, but pause/resume will be unavailable.
      rangeSupported = false
    } else {
      throw error
    }
  }

  if (/mpegurl|dash\+xml/i.test(contentType) || /\.(m3u8|mpd)(?:$|\?)/i.test(parsed.href)) {
    throw new Error('This is an HLS/DASH playlist, not a single media file. Browser-native downloading currently supports direct MP4, WebM and similar file URLs, not playlist/segment muxing.')
  }

  return {
    url: parsed.href,
    total,
    contentType,
    filename,
    etag,
    rangeSupported: rangeSupported && total > 0,
  }
}

function createSegments(total, useRanges) {
  if (!useRanges || total < MIN_PARALLEL_SIZE) {
    return [{ start: 0, end: total ? total - 1 : null, done: 0 }]
  }
  const count = Math.min(MAX_WORKERS, Math.max(2, Math.ceil(total / MIN_PARALLEL_SIZE)))
  const chunk = Math.ceil(total / count)
  return Array.from({ length: count }, (_, index) => {
    const start = index * chunk
    return { start, end: Math.min(total - 1, start + chunk - 1), done: 0 }
  }).filter((segment) => segment.start <= segment.end)
}

export default function BrowserDownloadManager({ title = '', mediaType = 'movie', compact = false }) {
  const [url, setUrl] = useState('')
  const [probe, setProbe] = useState(null)
  const [status, setStatus] = useState('idle')
  const [loaded, setLoaded] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [speed, setSpeed] = useState(0)
  const jobRef = useRef(null)
  const controllersRef = useRef(new Set())
  const pauseRequestedRef = useRef(false)
  const cancelRequestedRef = useRef(false)
  const bytesAtRef = useRef(0)
  const speedAtRef = useRef(Date.now())

  const updateLoaded = useCallback((job) => {
    const total = job.segments.reduce((sum, segment) => sum + segment.done, 0)
    const now = Date.now()
    const elapsed = Math.max(250, now - speedAtRef.current)
    const diff = total - bytesAtRef.current
    if (diff >= 0) setSpeed((diff * 1000) / elapsed)
    bytesAtRef.current = total
    speedAtRef.current = now
    setLoaded(total)
  }, [])

  const runJob = useCallback(async (job, resume = false) => {
    pauseRequestedRef.current = false
    cancelRequestedRef.current = false
    controllersRef.current.clear()
    setError('')
    setMessage('')
    setStatus('downloading')
    speedAtRef.current = Date.now()
    bytesAtRef.current = job.segments.reduce((sum, segment) => sum + segment.done, 0)

    let writable
    try {
      writable = await job.fileHandle.createWritable({ keepExistingData: resume })
      if (!resume && job.total) await writable.truncate(job.total)
    } catch (writeError) {
      setStatus('error')
      setError(`Could not open the destination file: ${writeError.message}`)
      return
    }

    const writeStream = async (segment, ranged) => {
      if (ranged) {
        let offset = segment.start + segment.done
        while (offset <= segment.end && !pauseRequestedRef.current && !cancelRequestedRef.current) {
          const controller = new AbortController()
          controllersRef.current.add(controller)
          let response
          try {
            const headers = { Range: `bytes=${offset}-${segment.end}` }
            response = await fetch(job.url, {
              method: 'GET',
              headers,
              mode: 'cors',
              credentials: 'omit',
              redirect: 'follow',
              cache: 'no-store',
              signal: controller.signal,
            })
            if (response.status !== 206) {
              await response.body?.cancel().catch(() => {})
              throw new Error('The source stopped honoring byte-range requests. Restart this download from the beginning.')
            }
            if (!response.body) throw new Error('The browser could not read the download stream.')
            const reader = response.body.getReader()
            try {
              while (!pauseRequestedRef.current && !cancelRequestedRef.current) {
                const { done, value } = await reader.read()
                if (done) break
                await writable.write({ type: 'write', position: offset, data: value })
                offset += value.byteLength
                segment.done += value.byteLength
                updateLoaded(job)
              }
            } finally {
              reader.releaseLock()
            }
          } finally {
            controllersRef.current.delete(controller)
          }
        }
        return
      }

      // Non-range sources can still be saved, but cannot be safely resumed.
      const controller = new AbortController()
      controllersRef.current.add(controller)
      try {
        const response = await fetch(job.url, {
          mode: 'cors',
          credentials: 'omit',
          redirect: 'follow',
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`The source returned HTTP ${response.status}.`)
        if (!response.body) throw new Error('The browser could not read the download stream.')
        const reader = response.body.getReader()
        let offset = 0
        try {
          while (!pauseRequestedRef.current && !cancelRequestedRef.current) {
            const { done, value } = await reader.read()
            if (done) break
            await writable.write({ type: 'write', position: offset, data: value })
            offset += value.byteLength
            segment.done += value.byteLength
            updateLoaded(job)
          }
        } finally {
          reader.releaseLock()
        }
      } finally {
        controllersRef.current.delete(controller)
      }
    }

    try {
      const tasks = job.segments.map((segment) => writeStream(segment, job.rangeSupported))
      const results = await Promise.allSettled(tasks)
      const failed = results.find((result) => result.status === 'rejected' && result.reason?.name !== 'AbortError')
      await writable.close()

      if (failed) throw failed.reason
      const isPaused = pauseRequestedRef.current
      const isCancelled = cancelRequestedRef.current
      if (isCancelled) {
        setStatus('cancelled')
        setMessage('Download stopped. The partial file was kept at the selected location.')
      } else if (isPaused) {
        setStatus('paused')
        setMessage(job.rangeSupported ? 'Paused safely. Resume to continue from saved byte ranges.' : 'This source does not support ranges, so pause is unavailable. Restart to download again.')
      } else {
        setStatus('complete')
        setMessage('Download saved successfully to your selected location.')
      }
      updateLoaded(job)
    } catch (runError) {
      try { await writable.abort() } catch {}
      setStatus('error')
      setError(runError?.message || 'The download failed.')
    }
  }, [updateLoaded])

  const testLink = useCallback(async () => {
    setStatus('checking')
    setError('')
    setMessage('')
    setProbe(null)
    try {
      const result = await inspectDirectUrl(url.trim())
      setProbe(result)
      setStatus('ready')
      setMessage(result.rangeSupported
        ? 'Direct file is readable. Pause/resume and parallel byte ranges are available.'
        : 'Direct file is readable. It will download as one stream; pause/resume is unavailable for this source.')
    } catch (testError) {
      setStatus('error')
      setError(testError.message || 'Could not inspect this link.')
    }
  }, [url])

  const beginDownload = useCallback(async () => {
    setError('')
    setMessage('')
    if (!url.trim()) {
      setError('Paste a direct media-file URL first.')
      setStatus('error')
      return
    }

    if (typeof window.showSaveFilePicker !== 'function') {
      setStatus('unsupported')
      setMessage('This browser does not support streaming directly to a chosen file. Open the source link below and use the browser’s Save/Download action if the host permits it.')
      return
    }

    let fileHandle
    try {
      // The picker is invoked immediately within the click gesture as required by browsers.
      fileHandle = await window.showSaveFilePicker({
        suggestedName: probe?.filename || filenameFromUrl(url.trim()),
      })
    } catch (pickerError) {
      if (pickerError?.name === 'AbortError') return
      setStatus('error')
      setError(pickerError.message || 'Could not open the save-file picker.')
      return
    }

    try {
      setStatus('checking')
      const info = probe?.url === url.trim() ? probe : await inspectDirectUrl(url.trim())
      const job = {
        ...info,
        fileHandle,
        total: info.total,
        segments: createSegments(info.total, info.rangeSupported),
      }
      jobRef.current = job
      setProbe(info)
      setLoaded(0)
      setSpeed(0)
      await runJob(job, false)
    } catch (startError) {
      setStatus('error')
      setError(startError.message || 'Could not start this download.')
    }
  }, [url, probe, runJob])

  const pauseDownload = useCallback(() => {
    const job = jobRef.current
    if (!job || status !== 'downloading' || !job.rangeSupported) return
    pauseRequestedRef.current = true
    setStatus('pausing')
    controllersRef.current.forEach((controller) => controller.abort())
  }, [status])

  const cancelDownload = useCallback(() => {
    if (status !== 'downloading' && status !== 'pausing') return
    cancelRequestedRef.current = true
    pauseRequestedRef.current = true
    setStatus('cancelling')
    controllersRef.current.forEach((controller) => controller.abort())
  }, [status])

  const resumeDownload = useCallback(async () => {
    const job = jobRef.current
    if (!job || !['paused', 'cancelled'].includes(status)) return
    if (!job.rangeSupported && job.segments[0]?.done > 0) {
      setStatus('error')
      setError('This source cannot resume. Select the same destination and start again from zero.')
      return
    }
    if (job.segments.every((segment) => segment.done >= segment.end - segment.start + 1)) {
      setStatus('complete')
      return
    }
    await runJob(job, true)
  }, [runJob, status])

  const progress = probe?.total ? Math.min(100, (loaded / probe.total) * 100) : 0
  const isActive = ['checking', 'downloading', 'pausing', 'cancelling'].includes(status)
  const isFinished = status === 'complete'

  return (
    <section className={`browser-download-manager w-full rounded-2xl border border-white/10 bg-[#101010] p-4 text-white shadow-2xl sm:p-5 ${compact ? 'max-w-2xl' : 'max-w-4xl'}`}>
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-red-500/25 bg-red-500/10 text-red-400">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-red-400">Browser download manager</p>
          <h2 className="mt-0.5 text-xl font-black tracking-tight sm:text-2xl">Download to this device</h2>
          <p className="mt-1 text-xs leading-5 text-white/55">
            {title ? `Selected title: ${title} · ${mediaType === 'tv' ? 'Series' : 'Movie'}.` : 'Paste a direct media-file link from a source you are authorised to download.'}
            {' '}No terminal, native app or remote server is required.
          </p>
        </div>
      </div>

      <label htmlFor="royverse-direct-download-url" className="mt-5 block text-[10px] font-black uppercase tracking-[.16em] text-white/55">Direct media URL</label>
      <input
        id="royverse-direct-download-url"
        type="url"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={url}
        onChange={(event) => { setUrl(event.target.value); setProbe(null); if (status !== 'downloading') setStatus('idle'); setError(''); setMessage('') }}
        placeholder="https://example.com/video.mp4"
        className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-black/50 px-3.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-red-500"
      />

      {probe && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-white/[.04] p-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/40">File size</p>
            <p className="mt-1 text-xs font-bold text-white">{probe.total ? formatBytes(probe.total) : 'Unknown'}</p>
          </div>
          <div className="rounded-lg bg-white/[.04] p-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/40">Transfer</p>
            <p className="mt-1 text-xs font-bold text-white">{probe.rangeSupported ? '4-way range' : 'Single stream'}</p>
          </div>
          <div className="col-span-2 rounded-lg bg-white/[.04] p-3 sm:col-span-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/40">File type</p>
            <p className="mt-1 truncate text-xs font-bold text-white">{probe.contentType || 'Unknown'}</p>
          </div>
        </div>
      )}

      {(status === 'downloading' || status === 'pausing' || status === 'cancelling' || status === 'paused' || isFinished) && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3.5">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-bold text-white">{probe?.filename || 'Your download'}</span>
            <span className="shrink-0 tabular-nums text-white/55">{probe?.total ? `${progress.toFixed(1)}%` : formatBytes(loaded)}</span>
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-red-500 transition-[width] duration-200" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-[10px] text-white/45">
            <span>{formatBytes(loaded)}{probe?.total ? ` / ${formatBytes(probe.total)}` : ''}</span>
            <span>{status === 'downloading' ? `${formatBytes(speed)}/s` : status}</span>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-xs leading-5 text-red-200">{error}</p>}
      {message && <p role="status" className="mt-3 rounded-lg border border-white/10 bg-white/[.04] p-3 text-xs leading-5 text-white/70">{message}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={testLink}
          disabled={isActive || !url.trim()}
          className="min-h-11 flex-1 rounded-xl border border-white/15 px-4 text-xs font-black text-white transition hover:bg-white/10 disabled:opacity-40 sm:flex-none"
        >
          {status === 'checking' ? 'Checking…' : 'Check link'}
        </button>
        <button
          type="button"
          onClick={beginDownload}
          disabled={isActive || !url.trim() || isFinished}
          className="min-h-11 flex-1 rounded-xl bg-red-600 px-5 text-xs font-black text-white transition hover:bg-red-500 disabled:opacity-40 sm:flex-none"
        >
          Save to device
        </button>
        {status === 'downloading' && probe?.rangeSupported && (
          <button type="button" onClick={pauseDownload} className="min-h-11 rounded-xl border border-white/15 px-4 text-xs font-bold text-white hover:bg-white/10">Pause</button>
        )}
        {status === 'downloading' && (
          <button type="button" onClick={cancelDownload} className="min-h-11 rounded-xl border border-red-500/30 px-4 text-xs font-bold text-red-300 hover:bg-red-500/10">Stop</button>
        )}
        {['paused', 'cancelled'].includes(status) && (
          <button type="button" onClick={resumeDownload} className="min-h-11 rounded-xl bg-white px-4 text-xs font-black text-black hover:bg-white/85">Resume</button>
        )}
      </div>

      {status === 'unsupported' && (
        <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 text-xs font-bold text-white hover:bg-white/10">
          Open original source ↗
        </a>
      )}

      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="text-[10px] font-black uppercase tracking-[.15em] text-white/40">Browser limitations</p>
        <ul className="mt-2 space-y-1.5 text-[10px] leading-5 text-white/45">
          <li>• The link must point to a direct media file and allow browser CORS access. An embedded player's hidden stream URL cannot be read by this page.</li>
          <li>• Pause/resume and parallel ranges require the source to support HTTP byte ranges. Otherwise it downloads as one stream.</li>
          <li>• HLS/DASH playlists, DRM-protected streams and protected content are not merged or bypassed.</li>
          <li>• Direct-to-file saving uses the browser File System Access API on supported HTTPS browsers. Other browsers can open the original URL and use their own save controls.</li>
        </ul>
      </div>
    </section>
  )
}
