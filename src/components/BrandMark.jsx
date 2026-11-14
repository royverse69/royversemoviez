export default function BrandMark({ className = 'h-8 w-8' }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="royverse-mark-gradient" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B78BFF" />
          <stop offset="1" stopColor="#7535E8" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="36" height="36" rx="11" fill="#171020" stroke="currentColor" strokeOpacity=".55" />
      <rect x="8" y="9" width="24" height="22" rx="5" fill="url(#royverse-mark-gradient)" />
      <path d="M18 14.5a1 1 0 0 0-1.5.87v9.26a1 1 0 0 0 1.5.87l7.5-4.63a1 1 0 0 0 0-1.74L18 14.5Z" fill="white" />
      <circle cx="11.5" cy="12.5" r="1" fill="white" fillOpacity=".75" />
      <circle cx="11.5" cy="27.5" r="1" fill="white" fillOpacity=".75" />
    </svg>
  )
}
