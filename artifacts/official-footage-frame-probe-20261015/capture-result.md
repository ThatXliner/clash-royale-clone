# Bounded frame probe result

- Public canonical source: https://www.youtube.com/watch?v=xQBo-Oag2z4
- Requested range: 2434–2437 seconds (40:34–40:37), exactly 3 seconds.
- Requested stream: YouTube format 298, MP4, video-only, 1280×720 at 60 fps.
- Exact nested command:

```sh
yt-dlp --no-warnings --no-playlist --no-part --limit-rate 180K --socket-timeout 10 --download-sections '*2434-2437' --force-keyframes-at-cuts -f 298 -o 'artifacts/official-footage-frame-probe-20261015/crl-xQBo-Oag2z4-2434-2437.%(ext)s' 'https://www.youtube.com/watch?v=xQBo-Oag2z4'
```

- Wrapper limits: 20 MiB output/file-size cap; 90-second deadline.
- Wrapper command: `python3 artifacts/official-footage-frame-probe-20261015/bounded_capture.py`
- Elapsed: 2.039 seconds.
- yt-dlp exit: 1. ffmpeg exit: 8.
- HTTP result: `HTTP error 403 Forbidden`; ffmpeg reported `Server returned 403 Forbidden (access denied)`.
- No output media file was created (`outputs: []`); output bytes: 0; SHA-256: not applicable.
- No frame was acquired or viewed. No other timestamp was attempted, because the request was access-blocked; no retry or workaround was used.

The exact ffmpeg diagnostics, with the ephemeral signed Googlevideo URL redacted because it included an IP address and query signature, were:

```text
[https @ 0x9d2c1c000] HTTP error 403 Forbidden
[in#0 @ 0x9d301c000] Error opening input: Server returned 403 Forbidden (access denied)
Error opening input file [ephemeral signed Googlevideo URL redacted].
Error opening input files: Server returned 403 Forbidden (access denied)
ERROR: ffmpeg exited with code 8
```

No process remained running after the wrapper returned. The follow-up source remains only a lead; there is no evidence here about the battle viewport, broadcast overlays, exact visible action, game version, or visual parity.
