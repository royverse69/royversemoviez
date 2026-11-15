import { useSearchParams } from 'react-router-dom'
import BrowserDownloadManager from '../components/BrowserDownloadManager.jsx'

export default function DownloadsPage() {
  const [params] = useSearchParams()
  const title = params.get('title') || ''

  return (
    <div className="mobile-downloads-page mx-auto w-full max-w-screen-2xl px-3 pb-8 pt-20 sm:px-6 sm:pt-24 lg:px-10">
      <div className="mb-5 px-1">
        <p className="text-[10px] font-black uppercase tracking-[.2em] text-brand">Downloads</p>
        <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">Download a video</h1>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-mist sm:text-sm">
          Paste a direct video-file URL and use your browser's download handling.
        </p>
      </div>
      <BrowserDownloadManager title={title} />
    </div>
  )
}
