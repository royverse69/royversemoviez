import { useState } from 'react'

const DOCS = 'https://mesamirh.github.io/MovieBox-Tui/'
const RELEASES = 'https://github.com/mesamirh/MovieBox-Tui/releases/latest'
const README = 'https://github.com/mesamirh/MovieBox-Tui'
const ANDROID_INSTALL = 'pkg update && pkg install -y curl tar termux-tools termux-am && curl -fsSL https://raw.githubusercontent.com/mesamirh/MovieBox-Tui/main/install.sh | bash && termux-setup-storage'
const UNIX_INSTALL = 'curl -fsSL https://raw.githubusercontent.com/mesamirh/MovieBox-Tui/main/install.sh | bash'
const WINDOWS_INSTALL = 'irm https://raw.githubusercontent.com/mesamirh/MovieBox-Tui/main/install.ps1 | iex'

export default function MovieBoxTuiHandoff({ title, mediaType, embedded = false }) {
  const [platform, setPlatform] = useState(/Android/i.test(navigator.userAgent) ? 'android' : /Windows/i.test(navigator.userAgent) ? 'windows' : 'unix')
  const [copied, setCopied] = useState(false)
  const [titleCopied, setTitleCopied] = useState(false)

  const installCommand = platform === 'android'
    ? ANDROID_INSTALL
    : platform === 'windows'
      ? WINDOWS_INSTALL
      : UNIX_INSTALL

  const copy = async (value, setStatus) => {
    try {
      await navigator.clipboard.writeText(value)
      setStatus(true)
      window.setTimeout(() => setStatus(false), 1800)
    } catch {
      setStatus(false)
    }
  }

  return (
    <div className={`${embedded ? "relative min-h-[calc(100dvh-8rem)] rounded-2xl" : "absolute inset-0"} overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(229,9,20,.18),transparent_55%),#080808] text-white`}>
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-4 py-7 sm:px-8 sm:py-10">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-red-500/25 bg-red-500/10 text-red-400">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M7 8h10M7 12h4m-4 4h7M15 12h2" strokeLinecap="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-red-400">External playback option</p>
            <h2 className="mt-0.5 text-xl font-black sm:text-2xl">MovieBox-TUI</h2>
          </div>
          <span className="ml-auto shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-bold text-white/65">Native app</span>
        </div>

        <p className="max-w-2xl text-sm leading-6 text-white/70">
          MovieBox-TUI runs separately on your device. It searches its own providers, then opens playback in a local media player. A browser page cannot start that local app or send it a title automatically, so use the quick hand-off below.
        </p>

        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-white/45">Selected on RoyverseMoviez</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-red-500/15 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-red-300">{mediaType === 'tv' ? 'Series' : 'Movie'}</span>
            <h3 className="min-w-0 flex-1 text-base font-extrabold text-white">{title}</h3>
            <button
              onClick={() => copy(title, setTitleCopied)}
              className="min-h-9 rounded-lg border border-white/15 px-3 text-[10px] font-bold text-white/80 transition hover:bg-white/10"
            >
              {titleCopied ? 'Copied' : 'Copy title'}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-[#111] p-4">
            <p className="text-xs font-black text-white">1. Install MovieBox-TUI</p>
            <p className="mt-1.5 text-xs leading-5 text-white/55">Choose your device and run the official installation command, or download a verified release archive.</p>
            <label className="mt-4 block text-[9px] font-black uppercase tracking-[.15em] text-white/45">Your device</label>
            <select
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-[#1b1b1b] px-3 text-xs font-bold text-white outline-none focus:border-red-500"
            >
              <option value="android">Android · Termux</option>
              <option value="windows">Windows · PowerShell</option>
              <option value="unix">macOS / Linux · Terminal</option>
            </select>
            <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/60 p-3 text-[10px] leading-5 text-white/75">{installCommand}</pre>
            <button
              onClick={() => copy(installCommand, setCopied)}
              className="mt-2 min-h-10 w-full rounded-lg bg-white px-3 text-xs font-black text-black transition hover:bg-white/85"
            >
              {copied ? 'Command copied' : 'Copy install command'}
            </button>
            <a href={RELEASES} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-9 items-center text-xs font-bold text-red-300 hover:text-white">
              Download official release ↗
            </a>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#111] p-4">
            <p className="text-xs font-black text-white">2. Play or download this title</p>
            <ol className="mt-3 space-y-2.5 text-xs leading-5 text-white/65">
              <li><span className="mr-2 font-black text-red-400">01</span>Open MovieBox-TUI in your terminal.</li>
              <li><span className="mr-2 font-black text-red-400">02</span>Paste the copied title into its search bar and open the matching result.</li>
              <li><span className="mr-2 font-black text-red-400">03</span>Choose a stream quality and press Enter to play in mpv, VLC, IINA or an Android player.</li>
              <li><span className="mr-2 font-black text-red-400">04</span>To download, select a stream or episode and press <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-black text-white">d</kbd>. Press <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-black text-white">x</kbd> to pause/cancel an active transfer.</li>
            </ol>
            <div className="mt-4 rounded-lg border border-white/8 bg-black/35 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-white/45">Default download folder</p>
              <p className="mt-1 break-all font-mono text-xs text-white/80">~/Downloads/MovieBox-TUI/</p>
              <p className="mt-2 text-[10px] leading-4 text-white/45">The app supports pause/resume downloads. MovieBox DASH downloads additionally require yt-dlp and ffmpeg.</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a href={DOCS} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-lg border border-white/15 px-4 text-xs font-bold text-white/80 transition hover:bg-white/10">Full documentation ↗</a>
          <a href={`${README}/blob/main/docs/players.md`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-lg border border-white/15 px-4 text-xs font-bold text-white/80 transition hover:bg-white/10">Player guide ↗</a>
          <a href={`${README}/blob/main/docs/downloads.md`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-lg border border-white/15 px-4 text-xs font-bold text-white/80 transition hover:bg-white/10">Download guide ↗</a>
        </div>

        <p className="mt-4 text-[10px] leading-5 text-white/40">
          MovieBox-TUI is an independent open-source application under MIT / Apache-2.0. RoyverseMoviez does not bundle it, operate its providers, or guarantee third-party stream availability. Install only from the official project links and follow the laws and terms that apply where you live.
        </p>
      </div>
    </div>
  )
}
