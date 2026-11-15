# RoyverseMoviez MovieBox-TUI download backend

This folder contains the HTTP service used by the RoyverseMoviez website. The MovieBox-TUI project itself is a native Rust application, so this small service exposes its MovieBox provider through HTTP for the web app.

## Deploy once with Render

1. Connect this GitHub repository to Render and create a **Blueprint** using the root `render.yaml`.
2. Apply the Blueprint. It creates the `royverse-moviebox-api` web service using the included Dockerfile.
3. When the service is live, open `https://YOUR-SERVICE.onrender.com/health`. It should return JSON with `"ok": true`.
4. In RoyverseMoviez, open **Settings → Download Backend**, paste the service's `https://...` URL and select **Test connection**.

The value entered in Settings is saved in the current browser. The same backend also provides `GET /tmdb/{path}` as a fixed-host TMDB API proxy. Once the backend URL is configured, the frontend retries a browser-side TMDB network timeout through this route.

## API flow

- `GET /tmdb/{path}?api_key=...` forwards TMDB API requests to the fixed `api.themoviedb.org/3` host (for example `/tmdb/search/tv`). It forwards v4 Bearer auth when present.
- `GET /api/search?title=...&year=...&mediaType=movie|tv` searches MovieBox and ranks results against the TMDB title/year.
- `GET /api/details?subjectId=...` returns languages, seasons and episodes.
- `GET /api/streams?subjectId=...&season=...&episode=...` returns available qualities without exposing signed source URLs to the browser.
- `GET /api/download?subjectId=...&season=...&episode=...&releaseIndex=...&title=...` resolves the chosen release and streams the file back with an attachment filename.

For movies, season and episode are `0`. Series use the selected season and episode numbers.

The Docker image includes `yt-dlp` and `ffmpeg` for adaptive DASH/HLS downloads. Direct file sources are streamed through the backend and support browser Range requests.

## Local run

Install Rust 1.90 or newer, `ffmpeg`, and `yt-dlp`, then run:

```sh
cargo run --release --manifest-path download-api/Cargo.toml
```

The API listens on port `10000` by default (or the `PORT` environment variable). The service allows browser CORS requests so the GitHub Pages app can call it.
