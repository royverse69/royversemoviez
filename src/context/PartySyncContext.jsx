import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const PartySyncContext = createContext(null)
const MAX_RECONNECT_ATTEMPTS = 5

export function PartySyncProvider({ children }) {
  const wsRef = useRef(null)
  const handleServerMessageRef = useRef(null)
  const joinParamsRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef(null)
  const connectionTimerRef = useRef(null)
  const roomAckTimerRef = useRef(null)
  const roomJoinedRef = useRef(false)
  const intentionalCloseRef = useRef(false)
  const inRoomRef = useRef(false)

  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [roomCode, setRoomCode] = useState(null)
  const [role, setRole] = useState(null)
  const [participantId, setParticipantId] = useState(null)
  const [participants, setParticipants] = useState([])
  const [hostId, setHostId] = useState(null)
  const [partyMedia, setPartyMedia] = useState(null)
  const [lastEvent, setLastEvent] = useState(null)
  const [syncRequested, setSyncRequested] = useState(false)
  const [syncRequestId, setSyncRequestId] = useState(0)
  const [shareActive, setShareActive] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [voiceParticipants, setVoiceParticipants] = useState([])
  const [error, setError] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()
  const relayHandlersRef = useRef(new Set())

  const sendMessage = useCallback((data) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data))
    }
  }, [])

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true
    clearTimeout(reconnectTimerRef.current)
    clearTimeout(connectionTimerRef.current)
    clearTimeout(roomAckTimerRef.current)
    roomJoinedRef.current = false
    const ws = wsRef.current
    if (ws) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'leave' })) } catch {}
      }
      inRoomRef.current = false
      ws.close()
      wsRef.current = null
    }
    setConnected(false)
    setReconnecting(false)
    setRoomCode(null)
    setRole(null)
    setParticipantId(null)
      setParticipants([])
      setHostId(null)
      setPartyMedia(null)
      setLastEvent(null)
      setSyncRequested(false)
      setShareActive(false)
      setChatMessages([])
      setVoiceParticipants([])
      setError(null)
    joinParamsRef.current = null
    reconnectAttemptsRef.current = 0
  }, [])

  const connect = useCallback((code, name, media) => {
    joinParamsRef.current = { code, name, media }
    setError(null)
    setConnected(false)
    setReconnecting(false)
    roomJoinedRef.current = false

    let savedWorkerUrl = ''
    try { savedWorkerUrl = window.localStorage.getItem('royversemoviez.party-ws-url') || '' } catch {}
    const configuredUrl = import.meta.env.VITE_PARTY_WS_URL || savedWorkerUrl
    const localDevelopmentUrl = import.meta.env.DEV ? 'ws://localhost:8787' : ''
    const rawUrl = configuredUrl || localDevelopmentUrl

    if (!rawUrl) {
      inRoomRef.current = false
      setError('Watch Party server is not configured. Add your Cloudflare Worker URL in Settings → Watch Party Server, then retry.')
      return
    }

    let socketUrl
    try {
      const endpoint = new URL(rawUrl)
      if (endpoint.protocol === 'https:') endpoint.protocol = 'wss:'
      if (endpoint.protocol === 'http:') endpoint.protocol = 'ws:'
      if (!['ws:', 'wss:'].includes(endpoint.protocol)) throw new Error('Use an https:// or wss:// Worker URL.')
      endpoint.pathname = `${endpoint.pathname.replace(/[/]+$/, '')}/party/${encodeURIComponent(code)}`
      endpoint.search = ''
      endpoint.hash = ''
      socketUrl = endpoint.toString()
    } catch (urlError) {
      inRoomRef.current = false
      setError(`Invalid Watch Party server URL: ${urlError.message}`)
      return
    }

    intentionalCloseRef.current = false
    reconnectAttemptsRef.current = 0
    inRoomRef.current = true
    setReconnecting(true)

    const openSocket = () => {
      clearTimeout(connectionTimerRef.current)
      clearTimeout(roomAckTimerRef.current)
      roomJoinedRef.current = false

      let ws
      try {
        ws = new WebSocket(socketUrl)
      } catch {
        setConnected(false)
        setReconnecting(false)
        setError('Could not create a Watch Party connection. Check the Worker URL.')
        inRoomRef.current = false
        return
      }
      wsRef.current = ws

      connectionTimerRef.current = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          setError('Watch Party server did not respond. Retrying the connection...')
          try { ws.close() } catch {}
        }
      }, 10000)

      ws.onopen = () => {
        clearTimeout(connectionTimerRef.current)
        setConnected(true)
        setReconnecting(false)
        setRoomCode(code)
        setError(null)
        ws.send(JSON.stringify({ type: 'join', roomCode: code, name, media }))

        roomAckTimerRef.current = setTimeout(() => {
          if (!roomJoinedRef.current && ws.readyState === WebSocket.OPEN) {
            setError('The server connected but did not confirm this room. Check that the latest Cloudflare Worker is deployed.')
            try { ws.close() } catch {}
          }
        }, 10000)
      }

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data)
          handleServerMessageRef.current?.(data)
        } catch {}
      }

      ws.onerror = () => {
        setError('Watch Party connection failed. Check the Cloudflare Worker URL and deployment.')
      }

      ws.onclose = () => {
        clearTimeout(connectionTimerRef.current)
        clearTimeout(roomAckTimerRef.current)
        setConnected(false)
        wsRef.current = null
        if (!intentionalCloseRef.current && inRoomRef.current) {
          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current += 1
            setReconnecting(true)
            setError(`Connection lost. Retrying (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})…`)
            reconnectTimerRef.current = setTimeout(() => {
              if (!intentionalCloseRef.current && inRoomRef.current) openSocket()
            }, 1800)
          } else {
            inRoomRef.current = false
            setReconnecting(false)
            setError('Could not connect after several attempts. Verify the Worker URL and try again.')
          }
        }
      }
    }

    openSocket()
  }, [])


  handleServerMessageRef.current = useCallback((data) => {
    switch (data.type) {
      case 'room:joined':
        roomJoinedRef.current = true
        clearTimeout(roomAckTimerRef.current)
        setError(null)
        setRole(data.role)
        setParticipantId(data.participantId)
        setPartyMedia(data.media)
        setParticipants(data.participants || [])
        setHostId(data.hostId || null)
        setShareActive(Boolean(data.shareActive))
        if (Array.isArray(data.voiceParticipants)) {
          setVoiceParticipants(data.voiceParticipants)
        }
        if (data.currentState) {
          setLastEvent(data.currentState)
        }
        break
      case 'room:state': {
        setParticipants(data.participants || [])
        const newHostId = data.newHostId || data.hostId || null
        setHostId(newHostId)
        if (data.newHostId && data.newHostId === participantId) {
          setRole('host')
        }
        break
      }
      case 'room:left':
        setParticipants((prev) => prev.filter((p) => p.id !== data.participantId))
        break
      case 'room:synced':
        if (data.currentState) {
          setLastEvent(data.currentState)
        }
        setSyncRequested(false)
        break
      case 'party:event':
        setLastEvent(data.event)
        setSyncRequested(false)
        break
      case 'chat:message':
        setChatMessages((prev) => {
          const next = [...prev, {
            id: `${data.fromParticipantId}-${data.timestamp}`,
            fromParticipantId: data.fromParticipantId,
            fromName: data.fromName,
            text: data.text,
            timestamp: data.timestamp,
          }]
          return next.length > 200 ? next.slice(next.length - 200) : next
        })
        break
      case 'new_media':
        setPartyMedia(data.media || null)
        break
      case 'sync_requested':
        setSyncRequested(true)
        setSyncRequestId((n) => n + 1)
        break
      case 'share:started':
        setShareActive(true)
        break
      case 'share:stopped':
        setShareActive(false)
        break
      case 'voice:state':
        setVoiceParticipants((prev) => {
          const next = prev.filter((id) => id !== data.fromParticipantId)
          if (data.on) next.push(data.fromParticipantId)
          return next
        })
        break
      case 'rtc:relay': {
        const handlers = relayHandlersRef.current
        handlers.forEach((fn) => {
          try { fn(data.from, data.payload) } catch {}
        })
        break
      }
      case 'room:empty':
        setError('Room is empty')
        navigate('/party')
        disconnect()
        break
      case 'error':
        setError(data.message || 'An error occurred')
        break
    }
  }, [navigate, disconnect, participantId])

  useEffect(() => {
    const isPartyRoute = location.pathname.startsWith('/party/') && location.pathname !== '/party'
    if (!isPartyRoute && inRoomRef.current) {
      disconnect()
    }
  }, [location.pathname, disconnect])

  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      clearTimeout(reconnectTimerRef.current)
    }
  }, [])

  const retryConnection = useCallback(() => {
    const params = joinParamsRef.current
    if (!params) {
      setError('No pending party room. Return to the Watch Party lobby and create or join a room again.')
      return
    }
    connect(params.code, params.name, params.media)
  }, [connect])

  const createRoom = useCallback((code, name, media) => {
    connect(code, name, { ...media, isCreator: true })
  }, [connect])

  const joinRoom = useCallback((code, name) => {
    connect(code, name, null)
  }, [connect])

  const sendPartyEvent = useCallback((event) => {
    if (role !== 'host') return
    sendMessage({ type: 'party:event', roomCode, event })
  }, [role, roomCode, sendMessage])

  const requestSync = useCallback(() => {
    sendMessage({ type: 'request_sync' })
    setSyncRequested(true)
  }, [sendMessage])

  const setRoomMedia = useCallback((media) => {
    sendMessage({ type: 'media:set', media })
  }, [sendMessage])

  const sendShareSignal = useCallback((action) => {
    sendMessage({ type: action === 'start' ? 'share:start' : 'share:stop' })
  }, [sendMessage])

  const relay = useCallback((target, payload) => {
    sendMessage({ type: 'rtc:relay', target, payload })
  }, [sendMessage])

  const sendChat = useCallback((text) => {
    const trimmed = String(text || '').trim().slice(0, 500)
    if (trimmed) {
      sendMessage({ type: 'chat:message', text: trimmed })
    }
  }, [sendMessage])

  const setVoiceState = useCallback((on) => {
    sendMessage({ type: 'voice:state', on: Boolean(on) })
  }, [sendMessage])

  const onRelay = useCallback((fn) => {
    relayHandlersRef.current.add(fn)
    return () => relayHandlersRef.current.delete(fn)
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const value = {
    connected,
    reconnecting,
    roomCode,
    role,
    participantId,
    participants,
    hostId,
    isHost: role === 'host',
    partyMedia,
    lastEvent,
    syncRequested,
    syncRequestId,
    shareActive,
    error,
    createRoom,
    joinRoom,
    retryConnection,
    disconnect,
    sendPartyEvent,
    requestSync,
    setRoomMedia,
    sendChat,
    chatMessages,
    voiceParticipants,
    setVoiceState,
    sendShareSignal,
    relay,
    onRelay,
    clearError,
  }

  return <PartySyncContext.Provider value={value}>{children}</PartySyncContext.Provider>
}

export function usePartySync() {
  const ctx = useContext(PartySyncContext)
  if (!ctx) throw new Error('usePartySync must be used within PartySyncProvider')
  return ctx
}
