export default function BrandMark({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="royverse-mark-gradient" x1="5" y1="4" x2="43" y2="45" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff996b" />
          <stop offset=".48" stopColor="#ed2448" />
          <stop offset="1" stopColor="#871238" />
        </linearGradient>
        <linearGradient id="royverse-mark-glass" x1="7" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity=".3" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="45" height="45" rx="15" fill="#190c12" stroke="currentColor" strokeOpacity=".55" />
      <rect x="6" y="6" width="36" height="36" rx="11" fill="url(#royverse-mark-gradient)" />
      <rect x="6" y="6" width="36" height="36" rx="11" fill="url(#royverse-mark-glass)" />
      <path d="M20.1 14.6a2.1 2.1 0 0 0-3.15 1.82v15.16a2.1 2.1 0 0 0 3.15 1.82l12.1-7.58a2.1 2.1 0 0 0 0-3.56L20.1 14.6Z" fill="white" />
      <path d="M11 12.5h5M11 35.5h5" stroke="white" strokeOpacity=".6" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="36" cy="12" r="2" fill="white" />
    </svg>
  )
}
