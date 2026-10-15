# Review notes

The native Chrome comparison confirms a real visual improvement over `src/ui/combat-art.js`: the new body has layered wood and leaves, a mask, a shield and a fist. Both Ember and Jade accents appear. The top-row second original portrait was inspected from `public/assets/card-portraits-painted.webp`; the vector retains its specified wooden-mask/leaf/shield/fist cues.

The before panel measures the existing vector from every SVG path and conservatively expands computed strokes by half their width before unioning. The prototype audit measures rendered body groups and all visible filled paths plus the shadow in Chrome. There are no strokes on the prototype body paths. The body group bottoms all end at y=58; the shadow ends at y=61.1 inside the 64-unit canvas and is not treated as a body anchor.

The screenshots come directly from installed Chrome 155 stable through Playwright with channel `chrome`, viewport 1440×1200 CSS px, device scale 1, default browser launch settings, and no masks or pixel matching. The separate CUA Chrome window also visibly loaded the same candidate page and reported 13.00 CSS px for both baseline and prototype.

`method-failures.md` preserves the zsh wrapper issue, occupied initial port, and unavailable browser provider response. The retained focused test run is one test pass with exit code 0.
