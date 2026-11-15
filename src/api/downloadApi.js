const STORAGE_KEY = 'royversemoviez.download-api-url'

function cleanBase(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

export function getDownloadApiBaseUrl() {
  const envUrl = import.meta.env.VITE_DOWNLOAD_API_URL || ''
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw !== null) {
      let saved = raw
      try { saved = JSON.parse(raw) } catch {}
      if (String(saved || '').trim()) return cleanBase(saved)
    }
  } catch {
    // Settings are optional; fall back to the build-time URL.
  }
  return cleanBase(envUrl)
}

export async function downloadApiRequest(path, params = {}, baseOverride = '') {
  const base = cleanBase(baseOverride) || getDownloadApiBaseUrl()
  if (!base) {
    throw new Error('Download service is not connected. Add its URL in Settings.')
  }

  let url
  try {
    url = new URL(String(path || '').replace(/^\/+/, ''), `${base}/`)
  } catch {
    throw new Error('The Download API URL in Settings is invalid.')
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })

  let response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
  } catch {
    throw new Error('Could not reach the Download API. Check the URL and backend deployment.')
  }

  let data
  try { data = await response.json() } catch { data = null }
  if (!response.ok) {
    throw new Error(data?.error || `Download API request failed (${response.status}).`)
  }
  return data
}

export function buildDownloadUrl(params = {}, baseOverride = '') {
  const base = cleanBase(baseOverride) || getDownloadApiBaseUrl()
  if (!base) return ''
  const url = new URL('api/download', `${base}/`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })
  return url.toString()
}
