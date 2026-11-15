import { useEffect, useState } from 'react'
import { useApiKey } from '../context/ApiKeyContext.jsx'
import { useLocalStorage } from '../hooks/useLocalStorage.js'
import { useMyList } from '../context/MyListContext.jsx'
import { usePreferences } from '../context/PreferencesContext.jsx'
import { validateTmdbApiKey } from '../api/tmdb.js'
import { COUNTRIES } from '../data/countries.js'
import { SpinnerIcon } from '../components/icons.jsx'
import MovieCard from '../components/MovieCard.jsx'

export default function SettingsPage() {
  const { apiKey, updateApiKey, hasApiKey } = useApiKey()
  const { items } = useMyList()
  const { country, setCountry } = usePreferences()
  const [partyWorkerUrl, setPartyWorkerUrl] = useLocalStorage('royversemoviez.party-ws-url', '')
  const [omdbApiKey, setOmdbApiKey] = useLocalStorage('royversemoviez.omdb-api-key', '')
  const [traktClientId, setTraktClientId] = useLocalStorage('royversemoviez.trakt-client-id', '')
  const [workerTest, setWorkerTest] = useState({ status: 'idle', message: '' })
  const [draft, setDraft] = useState(apiKey)
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => { setDraft(apiKey) }, [apiKey])

  const saveKey = async () => {
    const nextKey = draft.trim()
    if (!nextKey) {
      setMessage({ type: 'error', text: 'Enter a TMDB API key before saving.' })
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      const valid = await validateTmdbApiKey(nextKey)
      if (!valid) {
        setMessage({ type: 'error', text: 'TMDB rejected this API key. Check it and try again.' })
        return
      }

      updateApiKey(nextKey)
      setMessage({ type: 'success', text: 'API key saved. The catalog is refreshing.' })
    } catch {
      setMessage({ type: 'error', text: 'Could not verify the key. Check your connection and try again.' })
    } finally {
      setSaving(false)
    }
  }

  const removeKey = () => {
    updateApiKey('')
    setDraft('')
    setMessage({ type: 'success', text: 'API key removed. Add your own key to restore the live catalog.' })
  }

  const testPartyWorker = async () => {
    setWorkerTest({ status: 'testing', message: 'Checking the Worker health endpoint…' })
    try {
      const base = new URL(partyWorkerUrl.trim())
      if (base.protocol === 'wss:') base.protocol = 'https:'
      if (base.protocol === 'ws:') base.protocol = 'http:'
      if (!['https:', 'http:'].includes(base.protocol)) throw new Error('Use an https:// Worker URL.')
      base.pathname = `${base.pathname.replace(/[/]+$/, '')}/health`
      base.search = ''
      base.hash = ''
      const response = await fetch(base.toString(), { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !data.ok || !data.durableObjectsConfigured) {
        throw new Error(data.error || 'Worker responded, but the Durable Object binding is not ready.')
      }
      setWorkerTest({ status: 'success', message: 'Connected — Worker and PARTY_ROOMS binding are responding.' })
    } catch (error) {
      setWorkerTest({ status: 'error', message: error.message || 'Could not reach the Watch Party Worker.' })
    }
  }

  return (
    <div className="mx-auto max-w-screen-2xl px-4 pb-16 pt-24 sm:px-6 lg:px-10">
      <p className="mb-1 text-xs font-black uppercase tracking-[0.22em] text-brand">RoyverseMoviez</p>
      <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Settings</h1>
      <p className="mt-1.5 text-sm text-mist">Manage your catalog connection and saved titles.</p>

      {/* API Key Card */}
      <div className="mt-6 rounded-2xl border border-white/12 bg-surface p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-white">TMDB API Key</h2>
            <p className="mt-0.5 text-xs text-mist">Used for movie and series metadata</p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[8px] font-black uppercase tracking-wider ${
              hasApiKey
                ? 'border-emerald-400/28 bg-emerald-400/8 text-cream'
                : 'border-white/12 bg-surface-light text-cream'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${hasApiKey ? 'bg-emerald-400' : 'bg-mist'}`}
            />
            {hasApiKey ? 'Connected' : 'Not Set'}
          </span>
        </div>

        <label className="mt-5 block text-[10px] font-black uppercase tracking-[0.16em] text-mist">
          API Key
        </label>
        <div className="mt-2 flex overflow-hidden rounded-lg border border-white/12 bg-[#0d0d0d]">
          <input
            type={showKey ? 'text' : 'password'}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setMessage(null) }}
            placeholder="Enter your TMDB v3 API key"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            className="min-h-[48px] flex-1 px-3.5 text-sm text-white outline-none placeholder:text-mist"
          />
          <button
            onClick={() => setShowKey((v) => !v)}
            className="w-[60px] border-l border-white/12 text-[9px] font-black uppercase tracking-wider text-cream transition hover:bg-white/5"
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-mist">
          Your key is stored only in this browser and sent directly to TMDB.
        </p>

        {message && (
          <p
            className={`mt-2.5 text-xs leading-relaxed ${
              message.type === 'error' ? 'text-red-400' : 'text-emerald-400'
            }`}
          >
            {message.text}
          </p>
        )}

        <div className="mt-4 flex gap-2.5">
          <button
            onClick={saveKey}
            disabled={saving}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-brand text-sm font-black text-white transition hover:bg-brand-hover disabled:opacity-55"
          >
            {saving && <SpinnerIcon className="h-4 w-4" />}
            {saving ? 'Verifying...' : 'Save API Key'}
          </button>
          {hasApiKey && (
            <button
              onClick={removeKey}
              disabled={saving}
              className="inline-flex min-h-[44px] min-w-[82px] items-center justify-center rounded-lg bg-surface-light text-sm font-extrabold text-cream transition hover:bg-white/10 disabled:opacity-55"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Watch Party connection */}
      <div className="mt-6 rounded-2xl border border-white/12 bg-surface p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-white">Watch Party Server</h2>
            <p className="mt-0.5 text-xs text-mist">Cloudflare Worker connection for creating and joining rooms</p>
          </div>
          <span className={`rounded-md border px-2 py-1.5 text-[8px] font-black uppercase tracking-wider ${partyWorkerUrl ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/25 bg-amber-400/10 text-amber-300'}`}>
            {partyWorkerUrl ? 'URL saved' : 'Not configured'}
          </span>
        </div>
        <label className="mt-5 block text-[10px] font-black uppercase tracking-[0.16em] text-mist">Worker base URL</label>
        <input
          type="url"
          value={partyWorkerUrl}
          onChange={(event) => setPartyWorkerUrl(event.target.value.trim())}
          placeholder="https://your-worker.your-subdomain.workers.dev"
          autoCapitalize="none"
          autoComplete="url"
          spellCheck={false}
          className="mt-2 min-h-12 w-full rounded-lg border border-white/12 bg-[#0d0d0d] px-3.5 text-sm text-white outline-none placeholder:text-mist/60 focus:border-brand"
        />
        <p className="mt-2 text-[10px] leading-relaxed text-mist">
          Paste the base URL of the deployed Worker from Cloudflare. RoyverseMoviez adds the /party/{'{code}'} route automatically. This value is saved only in this browser; a GitHub Actions VITE_PARTY_WS_URL secret can also set it for every visitor.
        </p>
        {workerTest.message && (
          <p role="status" className={`mt-3 text-xs leading-5 ${workerTest.status === 'error' ? 'text-red-300' : workerTest.status === 'success' ? 'text-emerald-300' : 'text-mist'}`}>
            {workerTest.message}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={testPartyWorker}
            disabled={!partyWorkerUrl.trim() || workerTest.status === 'testing'}
            className="min-h-10 rounded-lg bg-white px-4 text-xs font-black text-black transition hover:bg-cream disabled:opacity-40"
          >
            {workerTest.status === 'testing' ? 'Testing…' : 'Test connection'}
          </button>
          <button
            type="button"
            onClick={() => { setPartyWorkerUrl(''); setWorkerTest({ status: 'idle', message: '' }) }}
            disabled={!partyWorkerUrl}
            className="min-h-10 rounded-lg border border-white/15 px-4 text-xs font-bold text-cream transition hover:bg-white/5 disabled:opacity-40"
          >
            Clear URL
          </button>
          <a href="https://developers.cloudflare.com/workers/" target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-lg border border-white/15 px-4 text-xs font-bold text-cream transition hover:bg-white/5">
            Worker docs ↗
          </a>
        </div>
      </div>

      {/* IMDb ratings via OMDb */}
      <div className="mt-6 rounded-2xl border border-white/12 bg-surface p-4 sm:p-5">
        <div>
          <h2 className="text-lg font-extrabold text-white">IMDb Ratings</h2>
          <p className="mt-0.5 text-xs text-mist">Optional rating and vote-count enrichment for title details</p>
        </div>
        <label className="mt-5 block text-[10px] font-black uppercase tracking-[0.16em] text-mist">OMDb API key</label>
        <input
          type="password"
          value={omdbApiKey}
          onChange={(event) => setOmdbApiKey(event.target.value.trim())}
          placeholder="Enter your OMDb API key"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          className="mt-2 min-h-12 w-full rounded-lg border border-white/12 bg-[#0d0d0d] px-3.5 text-sm text-white outline-none placeholder:text-mist/60 focus:border-brand"
        />
        <p className="mt-2 text-[10px] leading-relaxed text-mist">
          An optional OMDb key adds IMDb rating, vote count and content rating to title pages. The key stays in this browser. OMDb is an independent, non-commercial data service and is not affiliated with IMDb.
        </p>
        <a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-white/15 px-4 text-xs font-bold text-cream transition hover:bg-white/5">
          Get an OMDb API key ↗
        </a>
      </div>

      {/* Trakt metadata fallback */}
      <div className="mt-6 rounded-2xl border border-white/12 bg-surface p-4 sm:p-5">
        <div>
          <h2 className="text-lg font-extrabold text-white">Trakt Search Fallback</h2>
          <p className="mt-0.5 text-xs text-mist">Optional independent title search with direct TMDB IDs</p>
        </div>
        <label className="mt-5 block text-[10px] font-black uppercase tracking-[0.16em] text-mist">Trakt Client ID</label>
        <input
          type="password"
          value={traktClientId}
          onChange={(event) => setTraktClientId(event.target.value.trim())}
          placeholder="Enter your Trakt application Client ID"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          className="mt-2 min-h-12 w-full rounded-lg border border-white/12 bg-[#0d0d0d] px-3.5 text-sm text-white outline-none placeholder:text-mist/60 focus:border-brand"
        />
        <p className="mt-2 text-[10px] leading-relaxed text-mist">
          Trakt is only called when the main catalog search fails. The first fallback to return playable TMDB IDs wins. The Client ID is stored in this browser.
        </p>
        <a href="https://trakt.tv/oauth/applications" target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-white/15 px-4 text-xs font-bold text-cream transition hover:bg-white/5">
          Create a Trakt application ↗
        </a>
      </div>

      {/* Content Country Card */}
      <div className="mt-6 rounded-2xl border border-white/12 bg-surface p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-white">Content Country</h2>
            <p className="mt-0.5 text-xs text-mist">
              Curates Home, Movies and Series rows with titles from one country
            </p>
          </div>
        </div>

        <label className="mt-5 block text-[10px] font-black uppercase tracking-[0.16em] text-mist">
          Country
        </label>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="mt-2 w-full cursor-pointer rounded-lg border border-white/12 bg-[#0d0d0d] px-3.5 py-3 text-sm font-bold text-white outline-none transition focus:border-brand"
        >
          <option value="">Global (no filter)</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>

        <p className="mt-2 text-[10px] leading-relaxed text-mist">
          Trending rows become country-specific picks since TMDB trending cannot be filtered by region.
        </p>
      </div>

      {/* My List section */}
      <div className="mt-8 border-t border-white/8 pt-6">
        <div className="mb-4">
          <h2 className="text-xl font-black text-white sm:text-2xl">My List</h2>
          <p className="mt-1 text-xs text-mist">
            {items.length} saved title{items.length === 1 ? '' : 's'}
          </p>
        </div>

        {items.length === 0 ? (
          <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-white/12 px-6 py-8 text-center">
            <p className="text-base font-extrabold text-cream">Nothing saved yet</p>
            <p className="mt-1.5 max-w-sm text-xs text-mist">
              Use the + button on any title to keep it here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((item) => (
              <MovieCard key={item.key} media={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
