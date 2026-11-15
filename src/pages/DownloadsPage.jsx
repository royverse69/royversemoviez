import MovieBoxTuiHandoff from '../components/MovieBoxTuiHandoff.jsx'

export default function DownloadsPage() {
  return (
    <div className="mobile-downloads-page mx-auto w-full max-w-screen-2xl px-3 pb-8 pt-20 sm:px-6 sm:pt-24 lg:px-10">
      <div className="mb-4 px-1">
        <p className="text-[10px] font-black uppercase tracking-[.2em] text-brand">Downloads</p>
        <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">Your downloads hub</h1>
        <p className="mt-1 text-xs text-mist sm:text-sm">Choose the external MovieBox-TUI companion for native playback and file downloads.</p>
      </div>
      <MovieBoxTuiHandoff title="Search a movie or series in MovieBox-TUI" mediaType="movie" embedded />
    </div>
  )
}
