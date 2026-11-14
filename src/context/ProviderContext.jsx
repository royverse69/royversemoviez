import { createContext, useCallback, useContext, useEffect, useMemo } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage.js'
import { DEFAULT_PROVIDER, getProvider } from '../data/providers.js'

const ProviderContext = createContext(null)

export function ProviderProvider({ children }) {
  const [storedProviderId, setStoredProviderId] = useLocalStorage('royversemoviez.provider', DEFAULT_PROVIDER)
  const providerId = getProvider(storedProviderId)?.id || DEFAULT_PROVIDER

  // Previous installations defaulted to VidCore; move that default to CineSrc.
  useEffect(() => {
    if (storedProviderId === 'vidcore') setStoredProviderId(DEFAULT_PROVIDER)
  }, [storedProviderId, setStoredProviderId])

  const setProvider = useCallback(
    (id) => setStoredProviderId(getProvider(id) ? id : DEFAULT_PROVIDER),
    [setStoredProviderId]
  )
  const value = useMemo(
    () => ({ providerId, provider: getProvider(providerId), setProvider }),
    [providerId, setProvider]
  )
  return <ProviderContext.Provider value={value}>{children}</ProviderContext.Provider>
}

export function useProvider() {
  const ctx = useContext(ProviderContext)
  if (!ctx) throw new Error('useProvider must be used within ProviderProvider')
  return ctx
}
