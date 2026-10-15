# Official footage provenance recon — 2026-10-15

## Scope and result

Read-only lead search against HEAD `cba1a984`, limited to official Supercell / Clash Royale sources. `PLAN.md` marks `VIS-001` (empty-arena calibration against `01_empty_arena_start.png`) and `VIS-002` (bridge, attack, projectile, splash, death, tower, elixir, overtime comparisons) as `BLOCKED` because required footage is absent. The HEAD footage tree contains only `reference/footage/NEEDED.md`; no gameplay captures are present. `NEEDED.md` asks for a full, uncropped default-arena view and specific timed interactions. `reference/stats/SOURCES.md` says exact arena coordinates and footprints are low-to-medium confidence and need frame-calibrated capture; its source ledger records access on 2026-07-30.

The strongest lead is the official 2022 CRL Day 1 broadcast: its YouTube metadata provides dated, named game segments suitable for follow-up inspection for `VIS-002`. Two official 2022 TV Royale videos provide shorter update/UI segments that may help `VIS-001`, but their relevant frames have not been verified. **No video frames were visible in this session**, so none of these leads is yet a capture-ready visual reference. Do not infer an in-game version, mode, viewport crop, or exact interaction from publication date, chapter title, or encoded canvas alone.

## Primary-source candidates

### 1. Best motion/combat lead: World Finals Day 1, Clash Royale League 2022

- Video: [World Finals Day 1! | Clash Royale League 2022](https://www.youtube.com/watch?v=xQBo-Oag2z4)
- Publisher: verified Clash Royale Esports channel. The video description identifies CRL as Supercell's official esports league.
- Published: 2022-09-23 (YouTube metadata); runtime 4:30:55; encoded video canvas 1920×1080.
- Primary event context: [Clash Royale League 2022 is HERE!](https://supercell.com/en/games/clashroyale/blog/esports/clash-royale-league-2022-is-here-2/) (Supercell, 2022-07-07) announces the official competition and says the World Finals run 2022-09-23 through 2022-09-25.
- YouTube chapter metadata lists game-related windows at 40:34–51:25 (“Game Number Two”), 51:25–1:09:34 (“First Match”), 1:09:34–1:44:39 (“Game Three”), and 2:01:20–end (“Game Two”). Link into the first labeled game window: [40:34](https://www.youtube.com/watch?v=xQBo-Oag2z4&t=2434s). Whether the chapters were manually set or generated was not determined.
- Could help: `VIS-002`, after frame inspection identifies bridge movement, attacks, projectiles, or other useful interactions. A full broadcast may also expose arena/tower layout, but that is unverified.
- Limits: no frames were seen; the named windows are broad match segments, not per-interaction annotations. The outer canvas is 16:9, but whether the game viewport is full-screen, letterboxed, cropped, or overlaid is unknown. No exact card/action, tournament level, or game build is established by the metadata. Not yet sufficient for `VIS-001`'s required empty opening frame.

### 2. Shorter arena/HUD lead: The Summer Update (TV Royale)

- Video: [Clash Royale: THE SUMMER UPDATE! ☀️ 🏳️ (TV Royale)](https://www.youtube.com/watch?v=P-UeChdsoWA)
- Publisher: verified Clash Royale channel.
- Published: 2022-06-24 (YouTube metadata); runtime 3:34; encoded video canvas 1920×1080.
- Primary context: [SUMMER UPDATE!](https://supercell.com/en/games/clashroyale/blog/release-notes/clash-royale-summer-update-2/) (Supercell, 2022-06-24) covers Battle Banners and a visual refresh.
- YouTube chapter metadata labels 0:18–1:25 “Battle Banners”; this is a targeted inspection window, not a verified full-arena capture. [Start at 0:18](https://www.youtube.com/watch?v=P-UeChdsoWA&t=18s). Whether the chapter was manually set or generated was not determined.
- Could help: a possible `VIS-001`/HUD lead if this segment shows an uncropped battle start. The official article establishes the feature topic, not the shot composition.
- Limits: frames not seen; actual game viewport, opening-hand state, timer/elixir visibility, and any battle content within the chapter remain unknown. No gameplay version/build claim is made from its date.

### 3. New-card and arena UI lead: October 2022 update TV Royale

- Video: [NEW UPDATE OUT NOW! 🧘 Two New Cards and much more! (TV Royale)](https://www.youtube.com/watch?v=Zm0LjUBZyUY)
- Publisher: verified Clash Royale channel.
- Published: 2022-10-22 (YouTube metadata); runtime 6:22; encoded video canvas 1920×1080. The official release-notes article was published 2022-10-26.
- Primary context: [NEW UPDATE!](https://supercell.com/en/games/clashroyale/blog/release-notes/new-update-october-2022/) (Supercell, 2022-10-26) links the TV Royale and documents the Path of Legends, Trophy Road expansion, Monk, Phoenix, and other update topics.
- YouTube chapter metadata labels 0:35–1:33 “Path of legends,” 1:33–2:29 “Trophy road expansion,” and 2:29–4:15 “New cards.” [Start at 2:29](https://www.youtube.com/watch?v=Zm0LjUBZyUY&t=149s). Whether the chapters were manually set or generated was not determined.
- Could help: a possible `VIS-001` arena/HUD presentation lead or `VIS-002` new-card/effect lead once inspected.
- Limits: frames not seen; chapter labels do not establish an arena battle shot, exact gameplay action, viewport, level, or build. It is a lead only.

## Access and confidence limits

- Supercell pages and YouTube metadata were accessible. The YouTube watch pages did not render through the web reader, and the in-app browser surface was unavailable. I used `yt-dlp` only with `--skip-download` to read YouTube title, uploader, publication date, runtime, encoded canvas, and chapter metadata. **No video media was downloaded and no gameplay frame or timestamped still was viewed.**
- The time windows above are chapter boundaries from YouTube metadata, not observed action timestamps. They narrow follow-up inspection but do not prove that the desired gameplay is visible there.
- The 1920×1080 value describes the encoded outer video canvas, not the game viewport. Exact game-frame dimensions, phone/tablet layout, crop, overlays, and camera scale remain unknown.
- The sources are all dated before March 2023, but date alone does not prove that footage uses the intended pre-Evolutions game build. Version/build evidence remains absent.
- No files were added to `reference/`, runtime source, documentation, or public assets. The only repository write is this provenance note.
