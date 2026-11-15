FROM rust:1.90-bookworm AS builder
WORKDIR /app
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg python3 python3-pip \
    && pip3 install --break-system-packages --no-cache-dir yt-dlp \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/royverse-moviebox-api /usr/local/bin/royverse-moviebox-api
ENV PORT=10000
EXPOSE 10000
CMD ["royverse-moviebox-api"]
