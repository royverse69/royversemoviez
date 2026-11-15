import { Link } from 'react-router-dom'
import { GENRES } from './Navbar.jsx'
import BrandMark from './BrandMark.jsx'

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-white/10 bg-ink">
      <div className="mx-auto grid max-w-screen-2xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-10">
        <div>
          <Link to="/" className="flex items-center gap-2 text-brand">
            <BrandMark className="h-7 w-7 shrink-0" />
            <span className="text-xl font-black tracking-tight">RoyverseMoviez</span>
          </Link>
          <p className="mt-3 text-sm leading-relaxed text-mist">
            Discover films and series, keep your favourites close, and enjoy a cleaner way to explore.
          </p>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-cream/70">Browse</h3>
          <ul className="space-y-2 text-sm text-mist">
            <li><Link to="/" className="transition hover:text-white">Home</Link></li>
            <li><Link to="/mylist" className="transition hover:text-white">My List</Link></li>
            <li><Link to="/search" className="transition hover:text-white">Search</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-cream/80">Genres</h3>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-mist">
            {GENRES.slice(0, 8).map((g) => (
              <li key={g.id}>
                <Link to={`/genre/${g.id}`} className="transition hover:text-white">
                  {g.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-cream/70">Powered by</h3>
          <a
            href="https://www.themoviedb.org"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-surface px-3 py-2 text-sm font-semibold text-cream/85 transition hover:border-brand hover:text-white"
          >
            <span className="flex h-5 w-5 items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M12 2 2 5.6v2.1h20V5.6L12 2Zm-8 8v6.5l2 1V10H4Zm4 0v9.2l2 .9V10H8Zm4 0v9.8l2-.9V10h-2Zm4 0v8.1l2-1V10h-2Z" />
              </svg>
            </span>
            TMDB
          </a>
          <p className="mt-3 text-xs leading-relaxed text-mist/70">
            A shoutout and thank-you to TMDB for powering movie and series discovery. This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
          <p className="mt-3 text-[11px] leading-relaxed text-mist/65">
            TVmaze may be used for series-search fallback and is credited under its CC BY-SA licence. Availability data is provided through TMDB in partnership with JustWatch. Optional IMDb-derived fields are supplied by OMDb.
          </p>
          <p className="mt-2 text-[10px] leading-relaxed text-mist/65">
            Optional search fallbacks include Trakt and StreamX; fallback results are mapped back to TMDB IDs before they can open in the player. StreamX is an independent community project, not a streaming host.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-mist/70">
            <a href="https://www.tvmaze.com/" target="_blank" rel="noreferrer" className="hover:text-white">TVmaze ↗</a>
            <a href="https://www.trakt.tv/" target="_blank" rel="noreferrer" className="hover:text-white">Trakt ↗</a>
            <a href="https://github.com/imzyrix/streamx-api" target="_blank" rel="noreferrer" className="hover:text-white">StreamX API ↗</a>
            <a href="https://www.justwatch.com/" target="_blank" rel="noreferrer" className="hover:text-white">JustWatch ↗</a>
            <a href="https://www.omdbapi.com/" target="_blank" rel="noreferrer" className="hover:text-white">OMDb ↗</a>
          </div>
        </div>
      </div>

      <div className="border-t border-white/5 py-5 text-center text-xs text-mist/60">
        © {new Date().getFullYear()} RoyverseMoviez · With love, Ashutosh Roy
      </div>
    </footer>
  )
}