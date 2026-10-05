---
name: character-creation
description: Create original Moss & Ember character concepts or playable-card integrations, including lore and requested art. Use for explicit character design or expansion requests; keep concept-only asks small.
---

# Character Creation

Scale the work to the request. A concept or lore request needs a functional role, an original name, and exactly two concrete sentences of lore grounded in Moss & Ember's woodland, river-workshop, copper, and emberseed setting. Do not generate images, invent combat stats, or edit runtime files for a concept-only ask. Add a portrait, directional combat sprites, catalog entries, UI, or mechanics only when requested or necessary for the explicitly requested playable result.

Keep every character original. Never reuse names, wording, art, audio, or other assets from the comparison game. `reference/` is for comparison only and must never be imported, copied, or shipped. For numeric gameplay comparisons, read `reference/stats/SOURCES.md`; low-confidence values are questions. Do not change existing combat stats casually. When new gameplay values are required, state their source or uncertainty and test each supported interaction against the relevant stat evidence.

For an implemented character, inspect the current content and UI before editing. The main seams are `src/content/cards/` and `src/content/index.js` for mechanics, `src/content/playable-roster.js` and `src/content/session-card-catalog.js` for playability admission, `src/ui/card-lore.js` for lore, `src/ui/card-portrait-art.js` for portrait lookup, and `src/content/visual-asset-manifest.js` for shipped image records. Integrate only the requested surface; a character concept does not need a full card or new mechanics.

When a portrait is requested, make original square art with the available image-generation tool and keep the subject readable at card-thumbnail size. The existing `public/assets/card-portraits-painted.webp` is a full 4×2 atlas for the original eight portraits. Preserve its cells and mapping; expansion portraits use a standalone square asset and URL mapping, following the `cell: null` entries in `src/ui/card-portrait-art.js`. Do not rebuild the atlas just to add a character.

Create directional walk and attack sprite assets only when requested. Integrate their frame selection through `src/ui/combat-art.js` and the live combat rendering path in `src/ui/combat-state.js` / `src/ui/combat-motion.js`; do not leave a requested sprite as a demo-only prototype. Derive animation frames and poses from simulation ticks or restored session state, never wall-clock time or unseeded randomness. Reduced-motion mode must use a stable frame. At matching ticks, normal and reduced-motion renders must restore pixel-identically.

Preserve the full-resolution generated source under `demo/assets/` and record its hash, dimensions, and byte length alongside the optimized shipped output in the appropriate `docs/art/*provenance.json` file. Record the generation prompt/tool, license, encoding settings, and both source and output SHA-256 values. Register the shipped file's path, dimensions, byte length, license, authorship, and SHA-256 in `src/content/visual-asset-manifest.js`. Keep each new shipped character image at or below 1 MiB.

For art or UI work, render the real app and save final screenshots at phone (390×844) and desktop (1440×933) sizes. Inspect the rendered pixels at their actual size. For live arena sprites, use the actual 540×960 arena surface; on the phone layout a deployed unit is about 13 px tall. Judge the visible silhouette and team readability at that size, not from an enlarged fixture or pixels that are offscreen. Verify the same checkpoint before and after restore at both sizes, including `prefers-reduced-motion`, and retain the screenshots as evidence. Source inspection alone does not verify visuals.

For a gameplay piece listed in `PLAN.md`, follow `.agents/skills/gauntlet-round/SKILL.md`: keep builder and blind critic in separate contexts, run the interaction tests for claimed support, and record the critic's rendered or executed evidence. Do not act as both builder and judge in one context. A concept-only response does not need a gauntlet round.
