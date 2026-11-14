import { useEffect, useState } from 'react'

export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw) return JSON.parse(raw)

      // Read and migrate saved data from the previous app namespace once.
      const legacyKey = key.startsWith('royversemoviez.')
        ? `streambox.${key.slice('royversemoviez.'.length)}`
        : null
      const legacyRaw = legacyKey ? window.localStorage.getItem(legacyKey) : null
      if (legacyRaw) {
        window.localStorage.setItem(key, legacyRaw)
        return JSON.parse(legacyRaw)
      }
      return initialValue
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // storage full / private mode — non-fatal
    }
  }, [key, value])

  return [value, setValue]
}