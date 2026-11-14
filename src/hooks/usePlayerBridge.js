import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const CINESRC_ORIGIN = 'https://cinesrc.st'
const CINESRC_READY_TIMEOUT_MS = 22_000
const BACKUP_TELEMETRY_TIMEOUT_MS = 10_000

function parseLegacyMessage(data) {
  let payload = data
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload) } catch { return null }
  }
  if (!payload || typeof payload !== 'object') return null

  if (payload.type === 'PLAYER_EVENT' && payload.data && typeof payload.data === 'object') {
    const d = payload.data
    const time = Number(d.currentTime)
    if (!Number.isFinite(time) || time < 0) return null
    return {
      time,
      duration: Number.isFinite(Number(d.duration)) ? Number(d.duration) : 0,
      paused: typeof d.playing === 'boolean' ? !d.playing : null,
    }
  }
  if (payload.type === 'MEDIA_DATA' && payload.data && typeof payload.data === 'object') {
    return { activityOnly: true, mediaData: payload.data }
  }
  if (payload.event === 'status') return { activityOnly: true, notFound: payload.data === 404 }
  const type = typeof payload.type === 'string' ? payload.type : ''
  if (!type.includes('timeupdate')) return null
  const time = Number(payload.time ?? payload.currentTime)
  if (!Number.isFinite(time) || time < 0) return null
  return {
    time,
    duration: Number.isFinite(Number(payload.duration)) ? Number(payload.duration) : 0,
    paused: typeof payload.paused === 'boolean' ? payload.paused : null,
  }
}

const initialState = {
  time: 0,
  duration: 0,
  paused: true,
  volume: 1,
  muted: false,
  playbackRate: 1,
  updatedAt: 0,
}

export function usePlayerBridge({ iframeRef, playerUrl, active = true }) {
  const [ready, setReady] = useState(false)
  const [hasTelemetry, setHasTelemetry] = useState(false)
  const [error, setError] = useState(null)
  const [closed, setClosed] = useState(false)
  const stateRef = useRef(initialState)
  const lastMessageAtRef = useRef(0)
  const mediaDataRef = useRef(null)
  const listenersRef = useRef(new Set())

  const playerOrigin = useMemo(() => {
    try { return playerUrl ? new URL(playerUrl).origin : null } catch { return null }
  }, [playerUrl])
  const isCineSrc = playerOrigin === CINESRC_ORIGIN

  const publish = useCallback((next) => {
    stateRef.current = next
    lastMessageAtRef.current = Date.now()
    listenersRef.current.forEach((fn) => { try { fn(next) } catch {} })
  }, [])

  const subscribe = useCallback((fn) => {
    listenersRef.current.add(fn)
    return () => listenersRef.current.delete(fn)
  }, [])
  const getState = useCallback(() => ({ ...stateRef.current }), [])
  const getLastMessageAt = useCallback(() => lastMessageAtRef.current, [])
  const getMediaData = useCallback(() => mediaDataRef.current, [])

  const sendCommand = useCallback((command, args = []) => {
    const win = iframeRef.current?.contentWindow
    if (!win || !playerOrigin) return

    if (playerOrigin === CINESRC_ORIGIN) {
      try { win.postMessage({ type: 'cinesrc:command', command, args }, CINESRC_ORIGIN) } catch {}
      return
    }

    const legacyCommands = {
      play: [{ type: 'player:play' }, { command: 'play' }],
      pause: [{ type: 'player:pause' }, { command: 'pause' }],
      seek: [
        { type: 'player:seek', time: Number(args[0]) || 0, currentTime: Number(args[0]) || 0, exact: true },
        { command: 'seek', time: Number(args[0]) || 0, exact: true },
        { command: 'seek', value: Number(args[0]) || 0 },
      ],
    }
    for (const payload of legacyCommands[command] || []) {
      try { win.postMessage(payload, playerOrigin) } catch {}
    }
  }, [iframeRef, playerOrigin])

  const play = useCallback(() => sendCommand('play'), [sendCommand])
  const pause = useCallback(() => sendCommand('pause'), [sendCommand])
  const seek = useCallback((time) => sendCommand('seek', [Math.max(0, Number(time) || 0)]), [sendCommand])
  const setVolume = useCallback((volume) => {
    if (playerOrigin === CINESRC_ORIGIN) sendCommand('setVolume', [Math.min(1, Math.max(0, Number(volume) || 0))])
  }, [playerOrigin, sendCommand])
  const setMuted = useCallback((muted) => {
    if (playerOrigin === CINESRC_ORIGIN) sendCommand('setMuted', [Boolean(muted)])
  }, [playerOrigin, sendCommand])
  const setPlaybackRate = useCallback((rate) => {
    if (playerOrigin === CINESRC_ORIGIN) sendCommand('setPlaybackRate', [Math.min(2, Math.max(0.25, Number(rate) || 1))])
  }, [playerOrigin, sendCommand])
  const refresh = useCallback(() => {
    if (playerOrigin !== CINESRC_ORIGIN) return
    sendCommand('getCurrentTime')
    sendCommand('getDuration')
    sendCommand('getPaused')
    sendCommand('getVolume')
    sendCommand('getMuted')
    sendCommand('getPlaybackRate')
  }, [playerOrigin, sendCommand])

  useEffect(() => {
    if (!active || !playerUrl || !playerOrigin) return
    setReady(false)
    setHasTelemetry(false)
    setError(null)
    setClosed(false)
    stateRef.current = initialState
    lastMessageAtRef.current = 0
    mediaDataRef.current = null

    const fallbackTimer = window.setTimeout(() => {
      if (isCineSrc) {
        setHasTelemetry(false)
        setError('CineSrc did not become ready. Try a backup player.')
      } else {
        setHasTelemetry(false)
      }
    }, isCineSrc ? CINESRC_READY_TIMEOUT_MS : BACKUP_TELEMETRY_TIMEOUT_MS)

    let timerCleared = false
    const clearFallbackTimer = () => {
      if (timerCleared) return
      window.clearTimeout(fallbackTimer)
      timerCleared = true
    }

    const onMessage = (event) => {
      const iframe = iframeRef.current
      if (!iframe || event.source !== iframe.contentWindow || event.origin !== playerOrigin) return

      if (isCineSrc) {
        const payload = event.data
        if (!payload || typeof payload !== 'object' || typeof payload.type !== 'string') return
        const now = Date.now()
        const prev = stateRef.current

        if (payload.type === 'cinesrc:error') {
          clearFallbackTimer()
          setError(typeof payload.error === 'string' ? payload.error : 'CineSrc reported a playback error.')
          setHasTelemetry(false)
          return
        }
        if (payload.type === 'cinesrc:close') {
          setClosed(true)
          return
        }
        if (payload.type === 'cinesrc:ready' || payload.type === 'cinesrc:loadedmetadata') {
          clearFallbackTimer()
          setReady(true)
          setHasTelemetry(true)
          const duration = Number(payload.duration)
          publish({
            ...prev,
            duration: Number.isFinite(duration) && duration > 0 ? duration : prev.duration,
            updatedAt: now,
          })
          return
        }
        if (payload.type === 'cinesrc:timeupdate' || payload.type === 'cinesrc:seeking' || payload.type === 'cinesrc:seeked') {
          const time = Number(payload.currentTime)
          const duration = Number(payload.duration)
          if (!Number.isFinite(time) || time < 0) return
          const next = {
            ...prev,
            time,
            duration: Number.isFinite(duration) && duration > 0 ? duration : prev.duration,
            paused: payload.type === 'cinesrc:timeupdate' ? false : prev.paused,
            updatedAt: now,
          }
          publish(next)
          clearFallbackTimer()
          setReady(true)
          setHasTelemetry(true)
          return
        }
        if (payload.type === 'cinesrc:play' || payload.type === 'cinesrc:pause' || payload.type === 'cinesrc:ended') {
          publish({ ...prev, paused: payload.type !== 'cinesrc:play', updatedAt: now })
          clearFallbackTimer()
          setReady(true)
          setHasTelemetry(true)
          return
        }
        if (payload.type === 'cinesrc:volumechange') {
          const volume = Number(payload.volume)
          publish({
            ...prev,
            volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : prev.volume,
            muted: typeof payload.muted === 'boolean' ? payload.muted : prev.muted,
            updatedAt: now,
          })
          return
        }
        if (payload.type === 'cinesrc:ratechange') {
          const rate = Number(payload.playbackRate)
          if (Number.isFinite(rate)) publish({ ...prev, playbackRate: rate, updatedAt: now })
          return
        }
        if (payload.type === 'cinesrc:response') {
          let next = null
          if (payload.command === 'getCurrentTime' && Number.isFinite(Number(payload.result))) next = { ...prev, time: Number(payload.result), updatedAt: now }
          else if (payload.command === 'getDuration' && Number.isFinite(Number(payload.result))) next = { ...prev, duration: Number(payload.result), updatedAt: now }
          else if (payload.command === 'getPaused' && typeof payload.result === 'boolean') next = { ...prev, paused: payload.result, updatedAt: now }
          else if (payload.command === 'getVolume' && Number.isFinite(Number(payload.result))) next = { ...prev, volume: Math.min(1, Math.max(0, Number(payload.result))), updatedAt: now }
          else if (payload.command === 'getMuted' && typeof payload.result === 'boolean') next = { ...prev, muted: payload.result, updatedAt: now }
          else if (payload.command === 'getPlaybackRate' && Number.isFinite(Number(payload.result))) next = { ...prev, playbackRate: Number(payload.result), updatedAt: now }
          if (next) publish(next)
        }
        return
      }

      const parsed = parseLegacyMessage(event.data)
      if (!parsed) return
      const now = Date.now()
      if (parsed.activityOnly) {
        if (parsed.mediaData) mediaDataRef.current = parsed.mediaData
        lastMessageAtRef.current = now
        return
      }

      const prev = stateRef.current
      let paused = parsed.paused
      if (paused === null) {
        if (prev.updatedAt) {
          const elapsed = (now - prev.updatedAt) / 1000
          paused = parsed.time - prev.time <= Math.max(0.15, elapsed * 0.15)
        } else paused = true
      }
      publish({
        ...prev,
        time: parsed.time,
        duration: parsed.duration || prev.duration,
        paused,
        updatedAt: now,
      })
      clearFallbackTimer()
      setReady(true)
      setHasTelemetry(true)
    }

    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      clearFallbackTimer()
    }
  }, [active, playerUrl, playerOrigin, isCineSrc, iframeRef, publish])

  return useMemo(() => ({
    ready,
    hasTelemetry,
    error,
    closed,
    getState,
    getLastMessageAt,
    getMediaData,
    subscribe,
    play,
    pause,
    seek,
    setVolume,
    setMuted,
    setPlaybackRate,
    refresh,
  }), [ready, hasTelemetry, error, closed, getState, getLastMessageAt, getMediaData, subscribe, play, pause, seek, setVolume, setMuted, setPlaybackRate, refresh])
}
