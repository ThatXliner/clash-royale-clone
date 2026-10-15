# Probe commands and gated capture plan

All executed commands below requested public metadata only. No cookies, browser profile, authentication, video media, or storyboard images were requested.

## Executed

```sh
yt-dlp --version
command -v yt-dlp
command -v ffmpeg
yt-dlp --no-warnings --no-playlist --skip-download --print '%(title)s\n%(uploader)s\n%(upload_date)s\n%(duration_string)s\n%(width)sx%(height)s\n%(webpage_url)s\n%(chapters)s' 'https://www.youtube.com/watch?v=xQBo-Oag2z4'
yt-dlp --no-warnings --no-playlist --skip-download --list-formats 'https://www.youtube.com/watch?v=xQBo-Oag2z4'
```

Observed tool availability: `yt-dlp 2026.06.09` at `/opt/homebrew/bin/yt-dlp`; `ffmpeg` is present at `/opt/homebrew/bin/ffmpeg`, but it was not launched.

## Capture attempt

The parent released the exclusive browser/local-heavy window. The first prepared request was run through `bounded_capture.py` at the YouTube chapter boundary 2434s (40:34). It used the public URL, no auth/cookies, format 298, a 180 KiB/s rate limit, a 20 MiB per-file/output guard, and a 90-second deadline. Exact attempt details and the HTTP failure are recorded in `capture-result.md`.

```sh
python3 artifacts/official-footage-frame-probe-20261015/bounded_capture.py
```

The nested yt-dlp command was exactly:

```sh
yt-dlp --no-warnings --no-playlist --no-part --limit-rate 180K --socket-timeout 10 --download-sections '*2434-2437' --force-keyframes-at-cuts -f 298 -o 'artifacts/official-footage-frame-probe-20261015/crl-xQBo-Oag2z4-2434-2437.%(ext)s' 'https://www.youtube.com/watch?v=xQBo-Oag2z4'
```

The request returned HTTP 403 in 2.039 seconds with yt-dlp exit 1 and ffmpeg exit 8. There was no media file, so there is no output byte count/hash or frame. Per instruction, no fallback at 3085s or retry/workaround was attempted.

## Resulting limits

- Actual media request: blocked by HTTP 403; stopped as instructed.
- Actual timestamped frame: not acquired or viewed.
- Game viewport, broadcast overlays, perspective, visible actions, and game build: unknown.
