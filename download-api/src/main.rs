use axum::{
    body::Body,
    extract::{Query, State},
    http::{
        header::{
            ACCEPT_RANGES, CONTENT_DISPOSITION, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE,
            HeaderName, HeaderValue, RANGE,
        },
        HeaderMap, StatusCode,
    },
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use futures_util::StreamExt;
use moviebox_tui::{
    providers::{
        models::{MediaType, ProviderKind, Release},
        ReleaseProvider,
    },
    service::MovieBoxService,
};
use serde::{Deserialize, Serialize};
use std::{net::SocketAddr, path::PathBuf, sync::Arc, time::Duration};
use tokio::{process::Command, sync::Semaphore};
use tokio_util::io::ReaderStream;
use tower_http::cors::CorsLayer;
use url::Url;

#[derive(Clone)]
struct AppState {
    service: Arc<MovieBoxService>,
    http: reqwest::Client,
    work_slots: Arc<Semaphore>,
    download_slots: Arc<Semaphore>,
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}

#[derive(Serialize)]
struct Health {
    ok: bool,
    service: &'static str,
    provider: &'static str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchQuery {
    title: String,
    year: Option<String>,
    media_type: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchHit {
    subject_id: String,
    title: String,
    year: Option<String>,
    media_type: &'static str,
    poster_url: Option<String>,
    match_score: i32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubjectQuery {
    subject_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StreamsQuery {
    subject_id: String,
    #[serde(default)]
    season: usize,
    #[serde(default)]
    episode: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseOption {
    release_index: usize,
    filename: String,
    quality: Option<String>,
    language: Option<String>,
    size_bytes: Option<u64>,
    source: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamsResponse {
    releases: Vec<ReleaseOption>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadQuery {
    subject_id: String,
    #[serde(default)]
    season: usize,
    #[serde(default)]
    episode: usize,
    #[serde(default)]
    release_index: usize,
    title: Option<String>,
}

#[tokio::main]
async fn main() {
    let service = Arc::new(MovieBoxService::new());
    let http = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(4 * 60 * 60))
        .pool_idle_timeout(Duration::from_secs(90))
        .pool_max_idle_per_host(16)
        .build()
        .expect("build download HTTP client");

    let state = AppState {
        service,
        http,
        work_slots: Arc::new(Semaphore::new(8)),
        download_slots: Arc::new(Semaphore::new(2)),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/search", get(search))
        .route("/api/details", get(details))
        .route("/api/streams", get(streams))
        .route("/api/download", get(download))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let port = std::env::var("PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(10000);
    let address = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(address)
        .await
        .expect("bind API listener");

    eprintln!("RoyverseMoviez download API listening on {address}");
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .expect("serve API");
}

async fn health() -> Json<Health> {
    Json(Health {
        ok: true,
        service: "RoyverseMoviez Download API",
        provider: "MovieBox-TUI",
    })
}

async fn search(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<Vec<SearchHit>>, Response> {
    let title = query.title.trim();
    if title.is_empty() || title.len() > 120 {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "A title between 1 and 120 characters is required.",
        ));
    }

    let _slot = state.work_slots.acquire().await.map_err(internal_error)?;
    let items = state
        .service
        .search_typed(ProviderKind::MovieBox, title, 1)
        .await
        .map_err(|error| api_error(StatusCode::BAD_GATEWAY, error.to_string()))?;

    let wanted_type = query.media_type.as_deref().unwrap_or_default();
    let wanted_year = query.year.as_deref().unwrap_or_default();
    let mut hits: Vec<SearchHit> = items
        .into_iter()
        .filter_map(|item| {
            let media_type = match item.media_type {
                MediaType::Movie => "movie",
                MediaType::Series => "tv",
            };
            if !wanted_type.is_empty()
                && ((wanted_type == "movie" && media_type != "movie")
                    || (wanted_type == "tv" && media_type != "tv"))
            {
                return None;
            }
            let score = title_score(title, &item.title)
                + if !wanted_year.is_empty()
                    && item.year.as_deref() == Some(wanted_year)
                {
                    18
                } else {
                    0
                };
            Some(SearchHit {
                subject_id: item.id.value,
                title: item.title,
                year: item.year,
                media_type,
                poster_url: item.poster_url,
                match_score: score,
            })
        })
        .collect();

    hits.sort_by(|left, right| {
        right
            .match_score
            .cmp(&left.match_score)
            .then_with(|| left.title.cmp(&right.title))
    });
    hits.truncate(10);
    Ok(Json(hits))
}

async fn details(
    State(state): State<AppState>,
    Query(query): Query<SubjectQuery>,
) -> Result<Response, Response> {
    validate_subject_id(&query.subject_id)?;
    let _slot = state.work_slots.acquire().await.map_err(internal_error)?;
    let details = state
        .service
        .details_typed(ProviderKind::MovieBox, query.subject_id.trim())
        .await
        .map_err(|error| api_error(StatusCode::BAD_GATEWAY, error.to_string()))?;
    Ok(Json(details).into_response())
}

async fn streams(
    State(state): State<AppState>,
    Query(query): Query<StreamsQuery>,
) -> Result<Json<StreamsResponse>, Response> {
    validate_subject_id(&query.subject_id)?;
    validate_episode(query.season, query.episode)?;
    let _slot = state.work_slots.acquire().await.map_err(internal_error)?;
    let releases = get_releases(
        &state.service,
        &query.subject_id,
        query.season,
        query.episode,
    )
    .await?;
    Ok(Json(to_stream_options(releases)))
}

async fn download(
    State(state): State<AppState>,
    Query(query): Query<DownloadQuery>,
    request_headers: HeaderMap,
) -> Result<Response, Response> {
    validate_subject_id(&query.subject_id)?;
    validate_episode(query.season, query.episode)?;
    let _slot = state
        .download_slots
        .clone()
        .acquire_owned()
        .await
        .map_err(internal_error)?;

    let releases = get_releases(
        &state.service,
        &query.subject_id,
        query.season,
        query.episode,
    )
    .await?;

    let release = releases.get(query.release_index).ok_or_else(|| {
        api_error(
            StatusCode::NOT_FOUND,
            "That download option is no longer available. Refresh the stream list and try again.",
        )
    })?;
    let mirror = release.mirrors.first().ok_or_else(|| {
        api_error(StatusCode::BAD_GATEWAY, "The selected release has no downloadable source.")
    })?;

    let source = Url::parse(&mirror.resolver_url).map_err(|_| {
        api_error(StatusCode::BAD_GATEWAY, "The provider returned an invalid download source.")
    })?;
    if source.scheme() != "https" || source.host_str().is_none() {
        return Err(api_error(
            StatusCode::BAD_GATEWAY,
            "The provider returned an unsupported download source.",
        ));
    }

    let mut filename = safe_filename(
        query
            .title
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(&release.filename),
    );
    if query.season > 0 && query.episode > 0 {
        filename = format!("{filename} - S{:02}E{:02}", query.season, query.episode);
    }

    let path = source.path().to_ascii_lowercase();
    let is_adaptive = path.ends_with(".mpd")
        || path.ends_with(".m3u8")
        || path.contains("/dash/")
        || path.contains("/hls/");

    if is_adaptive {
        return download_adaptive(&source, &mirror.headers, &filename).await;
    }

    proxy_direct_download(
        &state.http,
        &source,
        &mirror.headers,
        &request_headers,
        &filename,
    )
    .await
}

async fn get_releases(
    service: &MovieBoxService,
    subject_id: &str,
    season: usize,
    episode: usize,
) -> Result<Vec<Release>, Response> {
    service
        .client
        .episode_streams(subject_id, season, episode)
        .await
        .map_err(|error| api_error(StatusCode::BAD_GATEWAY, error.to_string()))
}

fn to_stream_options(releases: Vec<Release>) -> StreamsResponse {
    let releases = releases
        .into_iter()
        .enumerate()
        .filter_map(|(index, release)| {
            let mirror = release.mirrors.first()?;
            Some(ReleaseOption {
                release_index: index,
                filename: release.filename,
                quality: release.quality,
                language: release.language,
                size_bytes: release.size_bytes,
                source: mirror.label.clone(),
            })
        })
        .collect();
    StreamsResponse { releases }
}

async fn proxy_direct_download(
    client: &reqwest::Client,
    source: &Url,
    upstream_headers: &[(String, String)],
    browser_headers: &HeaderMap,
    filename: &str,
) -> Result<Response, Response> {
    let mut request = client.get(source.clone());
    for (name, value) in upstream_headers {
        if !matches!(
            name.to_ascii_lowercase().as_str(),
            "user-agent" | "referer" | "cookie" | "authorization" | "origin"
        ) {
            continue;
        }
        if let (Ok(header_name), Ok(header_value)) = (
            HeaderName::from_bytes(name.as_bytes()),
            HeaderValue::from_str(value),
        ) {
            request = request.header(header_name, header_value);
        }
    }

    if let Some(range) = browser_headers.get(RANGE) {
        request = request.header(RANGE, range.clone());
    }
    let upstream = request
        .send()
        .await
        .map_err(|error| api_error(StatusCode::BAD_GATEWAY, format!("Could not open the provider download: {error}")))?;

    if !upstream.status().is_success() {
        return Err(api_error(
            StatusCode::BAD_GATEWAY,
            format!("The provider refused this download (HTTP {}).", upstream.status().as_u16()),
        ));
    }

    let status = upstream.status();
    let headers = upstream.headers().clone();
    let extension = source
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .and_then(|last| last.rsplit_once('.').map(|(_, extension)| extension))
        .filter(|extension| matches!(extension.to_ascii_lowercase().as_str(), "mp4" | "mkv" | "webm" | "ts"))
        .unwrap_or("mp4");
    let content_type = headers
        .get(CONTENT_TYPE)
        .cloned()
        .unwrap_or_else(|| HeaderValue::from_static("application/octet-stream"));
    let download_name = format!("{filename}.{extension}");
    let body = Body::from_stream(upstream.bytes_stream());
    let mut response = Response::builder()
        .status(status)
        .header(CONTENT_TYPE, content_type)
        .header(CONTENT_DISPOSITION, attachment_header(&download_name))
        .header("X-Content-Type-Options", "nosniff");

    for name in ["content-length", "content-range", "accept-ranges"] {
        if let Some(value) = headers.get(name) {
            response = response.header(name, value.clone());
        }
    }

    response
        .body(body)
        .map_err(|error| api_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))
}

async fn download_adaptive(
    source: &Url,
    upstream_headers: &[(String, String)],
    filename: &str,
) -> Result<Response, Response> {
    let directory = tempfile::tempdir()
        .map_err(|error| api_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
    let output_template: PathBuf = directory.path().join("video.%(ext)s");
    let mut command = Command::new("yt-dlp");
    command
        .arg("--no-warnings")
        .arg("--no-progress")
        .arg("--no-part")
        .arg("--no-playlist")
        .arg("--format")
        .arg("bestvideo+bestaudio/best")
        .arg("--merge-output-format")
        .arg("mp4")
        .arg("--output")
        .arg(&output_template)
        .arg(source.as_str());

    for (name, value) in upstream_headers {
        if matches!(
            name.to_ascii_lowercase().as_str(),
            "user-agent" | "referer" | "cookie" | "authorization"
        ) {
            command.arg("--add-header").arg(format!("{name}: {value}"));
        }
    }

    let result = command.output().await.map_err(|_| {
        api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "Adaptive downloads need yt-dlp and ffmpeg on the backend.",
        )
    })?;
    if !result.status.success() {
        let diagnostic = String::from_utf8_lossy(&result.stderr);
        let message = diagnostic
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("The adaptive stream could not be downloaded.");
        return Err(api_error(
            StatusCode::BAD_GATEWAY,
            format!("Download failed: {}", message.chars().take(220).collect::<String>()),
        ));
    }

    let path = std::fs::read_dir(directory.path())
        .map_err(|error| api_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| path.is_file())
        .ok_or_else(|| api_error(StatusCode::BAD_GATEWAY, "The provider returned no completed video file."))?;

    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| matches!(value.to_ascii_lowercase().as_str(), "mp4" | "mkv" | "webm"))
        .unwrap_or("mp4");
    let download_name = format!("{filename}.{extension}");
    let file = tokio::fs::File::open(&path)
        .await
        .map_err(|error| api_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
    let length = file
        .metadata()
        .await
        .map_err(|error| api_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?
        .len();

    let stream = futures_util::stream::unfold(
        (ReaderStream::new(file), directory),
        |(mut reader, directory)| async move {
            reader
                .next()
                .await
                .map(|chunk| (chunk, (reader, directory)))
        },
    );

    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, "application/octet-stream")
        .header(CONTENT_DISPOSITION, attachment_header(&download_name))
        .header(CONTENT_LENGTH, length)
        .body(Body::from_stream(stream))
        .map_err(|error| api_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))
}

fn title_score(wanted: &str, candidate: &str) -> i32 {
    let wanted = normalize_title(wanted);
    let candidate = normalize_title(candidate);
    if wanted.is_empty() || candidate.is_empty() {
        return 0;
    }
    if wanted == candidate {
        100
    } else if candidate.starts_with(&wanted) {
        82
    } else if candidate.contains(&wanted) {
        75
    } else if wanted.contains(&candidate) {
        58
    } else {
        0
    }
}

fn normalize_title(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn safe_filename(value: &str) -> String {
    let name: String = value
        .chars()
        .take(100)
        .map(|character| {
            if character.is_control()
                || matches!(character, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
            {
                '_'
            } else {
                character
            }
        })
        .collect();
    let name = name.trim_matches(['.', ' ', '_']);
    if name.is_empty() {
        "RoyverseMoviez-download".to_string()
    } else {
        name.to_string()
    }
}

fn attachment_header(filename: &str) -> String {
    let ascii: String = filename
        .chars()
        .map(|character| if character.is_ascii() { character } else { '_' })
        .collect();
    format!("attachment; filename=\"{}\"", ascii.replace('"', "_"))
}

fn validate_subject_id(value: &str) -> Result<(), Response> {
    if value.trim().is_empty() || value.len() > 128 {
        Err(api_error(
            StatusCode::BAD_REQUEST,
            "A valid MovieBox title ID is required.",
        ))
    } else {
        Ok(())
    }
}

fn validate_episode(season: usize, episode: usize) -> Result<(), Response> {
    if season > 100 || episode > 1000 {
        Err(api_error(StatusCode::BAD_REQUEST, "Invalid season or episode number."))
    } else {
        Ok(())
    }
}

fn internal_error(_: tokio::sync::AcquireError) -> Response {
    api_error(StatusCode::SERVICE_UNAVAILABLE, "The download service is busy. Try again shortly.")
}

fn api_error(status: StatusCode, message: impl Into<String>) -> Response {
    (status, Json(ErrorBody { error: message.into() })).into_response()
}
