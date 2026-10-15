# CARDS-023I builder source-only candidate

Input source fence: `ac224e9d8fa3e2797ea04c3e27b941abf18239c`.

This candidate adds the accepted Aether Well portrait mapping and exact two-sentence lore, passes canonical Aether Well structures through the real game UI projection, and renders the accepted battle-art helper at the UI-provided presentation scale. The browser integration draft starts from the actual collection, selects the ordered eight-card deck through a trusted editor action, and constructs its canonical seed-2 `GameSession` from that exact selected order.

The test draft is intended to verify the released collection detail, trusted player deployment, unforced natural AI deployment, returned resource receipts against same-boundary canonical state/HUD, real projected north/south art, reduced-motion and responsive redraw, exact snapshot/audio/input restore with whole-viewport PNG equality, natural terminal, and same-seed/same-deck restart.

**Not run:** Node, unit tests, browser tests, npm, dependency installation, build, server, Chrome, screenshot capture, or performance checks. Root's live full-Q endurance process remained active during this file-only implementation window. No result is verified and no pass is claimed.
