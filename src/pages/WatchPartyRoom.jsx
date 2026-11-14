import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { PartySyncProvider, usePartySync } from '../context/PartySyncContext.jsx'
import { useWebRTCHost, useWebRTCViewer } from '../hooks/useWebRTCShare.js'
import { useVoiceChat } from '../hooks/useVoiceChat.js'
import { usePartyPlaybackSync } from '../hooks/usePartyPlaybackSync.js'
import { buildEmbedUrl } from '../data/providers.js'
import PartyDock from '../components/PartyDock.jsx'
import ChatPanel from '../components/ChatPanel.jsx'
import PeoplePanel from '../components/PeoplePanel.jsx'
import SearchPanel from '../components/SearchPanel.jsx'

function PartyRoomInitializer() {
  const { code } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { createRoom, joinRoom } = usePartySync()
  const joinCalled = useRef(false)

  const hostName = location.state?.hostName
  const memberName = location.state?.memberName
  const media = location.state?.media

  useEffect(() => {
    if (!code || joinCalled.current) return
    joinCalled.current = true

    if (hostName) {
      createRoom(code, hostName, media)
    } else if (memberName) {
      joinRoom(code, memberName)
    } else {
      navigate(`/party?code=${code}`, { replace: true })
    }
  }, [code, hostName, memberName, media, createRoom, joinRoom, navigate])

  return <PartyRoomContent />
}

function PartyRoomContent() {
  const navigate = useNavigate()
  const {
    connected,
    reconnecting,
    role,
    roomCode,
    partyMedia,
    participants,
    hostId,
    isHost,
    error,
    syncRequested,
    syncRequestId,
    lastEvent,
    sendPartyEvent,
    shareActive,
    requestSync,
    setRoomMedia,
    disconnect,
    clearError,
    retryConnection,
    participantId,
    sendShareSignal,
    relay,
    onRelay,
    chatMessages,
    sendChat,
    voiceParticipants,
    setVoiceState,
  } = usePartySync()

  const viewerVideoRef = useRef(null)

  const {
    sharing,
    shareError,
    quality,
    setQuality,
    startShare,
    stopShare,
    audioUnavailable,
    displaySurface,
    collectStats,
  } = useWebRTCHost({
    participantId,
    participants,
    relay,
    onRelay,
    sendShareSignal,
    active: connected && isHost,
  })

  const [shareStats, setShareStats] = useState([])
  const collectStatsRef = useRef(collectStats)
  collectStatsRef.current = collectStats

  useEffect(() => {
    if (!sharing || participants.length < 2) {
      setShareStats([])
      return
    }
    const poll = async () => {
      const stats = await collectStatsRef.current()
      setShareStats(stats)
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [sharing, participants.length])

  const { remoteStream, viewerError, requestQuality } = useWebRTCViewer({
    shareActive,
    hostId,
    relay,
    onRelay,
    active: connected && !isHost,
  })

  const voice = useVoiceChat({
    active: connected,
    participantId,
    participants,
    voiceParticipants,
    setVoiceState,
    relay,
    onRelay,
  })

  const [memberQuality, setMemberQuality] = useState('hd')
  const [partyProvider, setPartyProvider] = useState('cinesrc')
  const handleMemberQuality = useCallback((key) => {
    setMemberQuality(key)
    requestQuality(key)
  }, [requestQuality])

  const [activeTab, setActiveTab] = useState('chat')
  const [unreadChat, setUnreadChat] = useState(0)
  const chatSeenRef = useRef(0)

  useEffect(() => {
    if (activeTab === 'chat') {
      chatSeenRef.current = chatMessages.length
      setUnreadChat(0)
    } else {
      setUnreadChat(Math.max(0, chatMessages.length - chatSeenRef.current))
    }
  }, [chatMessages.length, activeTab])

  useEffect(() => {
    const video = viewerVideoRef.current
    if (video && remoteStream) {
      video.srcObject = remoteStream
      video.play().catch(() => {})
    }
  }, [remoteStream])

  const handleLeave = () => {
    disconnect()
    navigate('/party')
  }

  const playerUrl =
    partyMedia?.mediaType && partyMedia?.mediaId
      ? buildEmbedUrl(partyProvider, partyMedia.mediaType, partyMedia.mediaId, partyMedia.season, partyMedia.episode)
      : null

  const iframeRef = useRef(null)
  const playback = usePartyPlaybackSync({
    iframeRef,
    playerUrl,
    connected,
    isHost,
    active: !shareActive,
    lastEvent,
    sendPartyEvent,
    syncRequestId,
  })

  useEffect(() => {
    if (partyProvider === 'cinesrc' && playback.bridge.error) {
      setPartyProvider('vidcore')
    }
  }, [partyProvider, playback.bridge.error])

  if (!connected && !partyMedia) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-ink px-5 py-10 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
          {error
            ? <span className="text-3xl text-brand">!</span>
            : <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-brand" />
          }
        </div>
        <h1 className="text-xl font-black text-white">{error ? 'Could not connect to Watch Party' : reconnecting ? 'Reconnecting to Watch Party' : 'Connecting to Watch Party'}</h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-mist">{error || 'Waiting for the party server to respond…'}</p>
        <div className="mt-6 flex w-full max-w-sm gap-3">
          {error && (
            <button onClick={retryConnection} className="min-h-11 flex-1 rounded-full bg-white px-5 text-sm font-black text-black transition hover:bg-cream">
              Retry connection
            </button>
          )}
          <button onClick={() => navigate('/settings')} className="min-h-11 flex-1 rounded-full border border-white/20 px-4 text-xs font-bold text-white transition hover:bg-white/10">
            Settings
          </button>
          <button onClick={handleLeave} className="min-h-11 flex-1 rounded-full border border-white/20 px-4 text-xs font-bold text-white transition hover:bg-white/10">
            Back to party
          </button>
        </div>
      </div>
    )
  }

  const memberViewingShare = !isHost && shareActive

  const tabs = [
    { key: 'chat', label: 'Chat', badge: unreadChat > 0 ? unreadChat : null },
    { key: 'people', label: 'People' },
    ...(isHost ? [{ key: 'search', label: 'Search' }] : []),
  ]

  return (
    <div className="flex min-h-[100dvh] flex-col bg-ink pt-14 lg:box-border lg:h-[100dvh] lg:min-h-0 lg:overflow-hidden">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#080808] px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            onClick={handleLeave}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-bold text-cream/80 transition hover:bg-white/10 hover:text-white"
          >
            <span aria-hidden="true">←</span>
            <span className="hidden sm:inline">Leave Party</span>
            <span className="sm:hidden">Leave</span>
          </button>
          <span className="h-5 w-px shrink-0 bg-white/15" />
          <div className="min-w-0">
            <p className="truncate text-xs font-black text-white sm:text-sm">{partyMedia?.title || 'Watch Party'}</p>
            <p className="truncate text-[9px] font-bold uppercase tracking-[.16em] text-mist">
              {partyMedia?.season ? `Season ${partyMedia.season} · Episode ${partyMedia.episode} · ` : ''}
              Room {roomCode}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {reconnecting && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-amber-400">Reconnecting</span>
          )}
          {shareActive && (
            <span className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-red-400">
              <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" /></span>
              Live
            </span>
          )}
          {!isHost && role === 'member' && !shareActive && (
            <span className="rounded-full bg-brand/15 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-brand">Member</span>
          )}
          <span className="hidden rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-bold text-mist sm:inline-flex">
            {participants.length} watching
          </span>
        </div>
      </header>

      {error && (
        <div className="flex shrink-0 items-center justify-between border-b border-red-500/20 bg-red-500/10 px-4 py-2">
          <p className="text-xs font-bold text-red-300">{error}</p>
          <button onClick={clearError} className="ml-3 text-red-300 transition-colors hover:text-white" aria-label="Dismiss error">×</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <main className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
          <div className="relative aspect-video w-full shrink-0 bg-black lg:aspect-auto lg:min-h-0 lg:flex-1">
            {partyProvider !== 'cinesrc' && !memberViewingShare && (
              <div className="absolute left-3 top-3 z-20 rounded-full border border-amber-300/20 bg-black/75 px-3 py-1.5 text-[10px] font-bold text-amber-100 backdrop-blur">
                CineSrc unavailable · using VidCore backup
              </div>
            )}

            {memberViewingShare ? (
              remoteStream ? (
                <video ref={viewerVideoRef} className="h-full w-full object-contain" autoPlay playsInline controls />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-mist">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-brand" />
                  <p className="text-sm font-bold">Connecting to host stream...</p>
                  {viewerError && <p className="px-4 text-center text-xs text-red-400">{viewerError}</p>}
                </div>
              )
            ) : playerUrl ? (
              <iframe
                ref={iframeRef}
                key={playerUrl}
                src={playerUrl}
                title={partyMedia?.title || 'Party player'}
                className="absolute inset-0 h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                style={{ pointerEvents: isHost || playback.status === 'blocked' ? 'auto' : 'none' }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-mist">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-brand" />
                <p className="text-sm">Loading player...</p>
              </div>
            )}

            {isHost && sharing && (
              <div className="absolute left-3 top-3 z-20 flex items-center gap-2 rounded-full bg-black/75 px-3 py-2 backdrop-blur">
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" /></span>
                <span className="text-[10px] font-black uppercase tracking-wider text-white">
                  Sharing to {Math.max(0, participants.length - 1)} member{participants.length - 1 === 1 ? '' : 's'}
                </span>
              </div>
            )}

            {!isHost && !shareActive && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3">
                <div className="rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-mist backdrop-blur sm:text-[10px]">
                  {playback.status === 'blocked' && <span className="text-amber-300">Tap play once to unlock synced playback</span>}
                  {playback.status === 'unavailable' && <span>Player sync unavailable · host can screen-share</span>}
                  {playback.status === 'syncing' && <span>Syncing with host…</span>}
                  {playback.status === 'synced' && <span className="text-emerald-300">In sync · host controls playback</span>}
                  {(playback.status === 'idle' || playback.status === 'host') && <span>Host controls playback</span>}
                </div>
              </div>
            )}
          </div>

          {isHost && sharing && (
            <div className="shrink-0 border-b border-white/10 bg-[#0b0b0b] px-3 py-2 sm:px-5">
              <p className="text-[10px] font-semibold text-mist">
                Keep the video tab visible while sharing. Members see the host’s shared screen.
              </p>
            </div>
          )}

          <PartyDock
            roomCode={roomCode}
            isHost={isHost}
            syncRequested={syncRequested}
            sharing={sharing}
            shareError={shareError}
            audioUnavailable={audioUnavailable}
            displaySurface={displaySurface}
            shareStats={shareStats}
            quality={quality}
            onSetQuality={setQuality}
            onStartShare={startShare}
            onStopShare={stopShare}
            onRequestSync={requestSync}
            memberQuality={memberQuality}
            onRequestQuality={handleMemberQuality}
            shareActive={shareActive}
          />
        </main>

        <aside className="flex min-h-[340px] shrink-0 flex-col border-t border-white/10 bg-[#0c0c0c] lg:min-h-0 lg:w-[340px] lg:border-l lg:border-t-0 xl:w-[380px]">
          <div className="flex shrink-0 border-b border-white/10 bg-[#101010] px-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex min-h-12 flex-1 items-center justify-center gap-1.5 px-2 text-[10px] font-black uppercase tracking-[.14em] transition-colors sm:text-xs ${
                  activeTab === tab.key ? 'text-white' : 'text-mist hover:text-white'
                }`}
                aria-pressed={activeTab === tab.key}
              >
                {tab.label}
                {tab.badge && <span className="rounded-full bg-brand px-1.5 py-0.5 text-[9px] leading-none text-white">{tab.badge}</span>}
                {activeTab === tab.key && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />}
              </button>
            ))}
            <span className="ml-2 flex shrink-0 items-center px-2 text-[9px] font-bold text-mist">{participants.length} online</span>
          </div>
          <div className="min-h-[285px] flex-1 overflow-hidden lg:min-h-0">
            {activeTab === 'chat' && (
              <ChatPanel
                chatMessages={chatMessages}
                participantId={participantId}
                onSendChat={sendChat}
                voice={voice}
                participants={participants}
                hostId={hostId}
              />
            )}
            {activeTab === 'people' && (
              <PeoplePanel
                participants={participants}
                hostId={hostId}
                participantId={participantId}
                voiceParticipants={voiceParticipants}
                onLeave={handleLeave}
              />
            )}
            {activeTab === 'search' && isHost && <SearchPanel onChangeMedia={setRoomMedia} />}
          </div>
        </aside>
      </div>
    </div>
  )
}

export default function WatchPartyRoom() {
  return (
    <PartySyncProvider>
      <PartyRoomInitializer />
    </PartySyncProvider>
  )
}
