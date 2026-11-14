import { useState } from 'react'

const STORAGE_KEY = 'royversemoviez.terms.v1'

export default function ConsentGate({ children }) {
  const [accepted, setAccepted] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'accepted' } catch { return false }
  })
  const [checked, setChecked] = useState(false)
  const [showTerms, setShowTerms] = useState(false)

  const accept = () => {
    if (!checked) return
    try { localStorage.setItem(STORAGE_KEY, 'accepted') } catch {}
    setAccepted(true)
  }

  if (accepted) return children

  return (
    <main className="fixed inset-0 z-[100] overflow-y-auto bg-[#09090b] px-3 py-5 text-white sm:grid sm:place-items-center sm:px-4 sm:py-10">
      <section className="mx-auto w-full max-w-2xl rounded-3xl border border-white/10 bg-[#141418] p-4 shadow-2xl shadow-black/50 sm:p-8">
        <div className="mb-5 flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-12 w-12 rounded-2xl" />
          <div>
            <p className="text-xs font-black uppercase tracking-[.22em] text-red-400">Welcome to</p>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">RoyverseMoviez</h1>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
          <h2 className="text-base font-black text-amber-200">Recommended browser</h2>
          <p className="mt-2 text-sm leading-6 text-amber-50/90">
            For better compatibility, Brave Browser is recommended on both desktop and mobile. Brave is optional;
            other browsers may work, but third-party players can behave differently across devices.
          </p>
          <a href="https://brave.com/download/" target="_blank" rel="noreferrer"
            className="mt-3 inline-flex min-h-10 items-center rounded-full border border-amber-200/40 px-4 text-sm font-bold text-amber-100">
            Get Brave Browser ↗
          </a>
        </div>

        <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4">
          <h2 className="text-base font-black text-red-200">Important third-party streaming warning</h2>
          <p className="mt-2 text-sm leading-6 text-red-50/90">
            Videos are served through independent third-party providers. RoyverseMoviez does not host or control
            those streams, advertisements, redirects, pop-ups, or external pages. <strong>Never download or install
            an app, APK, browser extension, codec, player update, or file</strong> offered by a player, advertisement,
            pop-up, or redirect. This app does not require any such installation. Close suspicious tabs and never
            enter payment details or personal information on unfamiliar pages.
          </p>
          <p className="mt-2 text-sm leading-6 text-red-50/90">
            I am not responsible for the content, availability, advertisements, redirects, downloads, or actions
            of third-party services. External services may change, fail, or behave unexpectedly; use them at your
            own discretion. No third-party safety, legality, or availability is guaranteed.
          </p>
        </div>

        <button type="button" onClick={() => setShowTerms((value) => !value)}
          className="mt-5 flex min-h-11 w-full items-center justify-between rounded-xl border border-white/15 px-4 text-left text-sm font-bold hover:bg-white/5">
          Terms & Conditions <span>{showTerms ? '−' : '+'}</span>
        </button>
        {showTerms && (
          <div className="mt-3 max-h-56 overflow-y-auto rounded-xl bg-black/30 p-4 text-xs leading-5 text-white/75">
            <p><strong>1. Nature of service.</strong> RoyverseMoviez is a movie and series discovery interface. It uses TMDB for catalogue metadata and embeds independently operated third-party media players. It does not host or upload video files.</p>
            <p className="mt-2"><strong>2. External providers.</strong> Playback, advertising, availability, redirects, and content are controlled by third parties. Their own terms and privacy policies apply when you use their services.</p>
            <p className="mt-2"><strong>3. Downloads and installation.</strong> Do not download or install applications, APKs, extensions, codecs, updates, or files prompted by external players or redirects. RoyverseMoviez does not require any of these.</p>
            <p className="mt-2"><strong>4. Legal use.</strong> You are responsible for determining whether access to external services and content is lawful in your location and for respecting applicable rights.</p>
            <p className="mt-2"><strong>5. No warranty.</strong> The app and external embeds are provided as available. No uninterrupted playback, quality, content availability, or third-party safety is guaranteed.</p>
            <p className="mt-2"><strong>6. Data and privacy.</strong> Catalogue requests go to TMDB. Playback requests connect directly to the selected external provider. Do not submit sensitive information to third-party players.</p>
            <p className="mt-2"><strong>7. Acceptance.</strong> By checking the box and continuing, you confirm that you have read and accepted these terms and the third-party safety notice.</p>
          </div>
        )}

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 p-3">
          <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-1 h-4 w-4 accent-red-500" />
          <span className="text-sm leading-6 text-white/85">
            I have read and agree to the Terms & Conditions, understand playback uses third-party services,
            and will not download or install anything prompted by an external player.
          </span>
        </label>
        <button type="button" disabled={!checked} onClick={accept}
          className="mt-4 min-h-12 w-full rounded-full bg-red-600 px-5 text-sm font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40">
          Accept & Continue
        </button>
        <p className="mt-4 text-center text-[11px] leading-5 text-white/45">
          Your choice is saved in this browser. Clear this site's storage to review the notice and terms again.
        </p>
      </section>
    </main>
  )
}
