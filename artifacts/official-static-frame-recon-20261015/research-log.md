# Official static-image reconnaissance

Repository HEAD: `ca865d07b3cdfde0980cdcb5dbbfaf3983325ca7`

## Outcome

No dated official static image found in this bounded pass provides an actual full-arena gameplay frame for VIS-001 or VIS-002. One official 2022 page image was downloaded and inspected as a candidate; it is a Battle Banner promotional montage, not a gameplay frame. It does not calibrate arena geometry, placement, combat motion, or HUD state. Treat it as copyright-protected reference material only; do not copy it into source, public assets, imports, or a shipped bundle.

## Inspected page candidates

1. **The Miner Update Info! — 29 Mar 2022**  
   Canonical page: <https://supercell.com/en/games/clashroyale/blog/release-notes/the-miner-update-info-2/>  
   The visible article images are badge/mastery and card/update illustrations. No full-arena gameplay frame was apparent from the page context; no image was downloaded.

2. **SUMMER UPDATE! — 24 Jun 2022**  
   Canonical page: <https://supercell.com/en/games/clashroyale/blog/release-notes/clash-royale-summer-update-2/>  
   The article says Battle Banners appear at the start of each battle. Its first related image was selected as the strongest static candidate and inspected below.

3. **NEW UPDATE! — 26 Oct 2022**  
   Canonical page: <https://supercell.com/en/games/clashroyale/blog/release-notes/new-update-october-2022/>  
   The inline images are presented as card art and Path of Legends, Trophy Road, and other feature screens. No full-arena gameplay frame was apparent from the page context; no image was downloaded.

## Downloaded candidate (does not meet the gameplay-frame goal)

- Local raw file: `candidate-01-battle-banner.jpg`
- Exact image URL: <https://clashroyale.inbox.supercell.com/9jtsgmsiuthj/HAjbMZQFKRH5XnaYI797Zxpj5HMUlrrS7h-tUWTTXYY/b00a278c4c1d60b41c61663f1d5a8e18/171191297_1656317050.JPG>
- Dated primary context: Summer Update article above, published 24 Jun 2022; the article describes Battle Banners as visible at battle start.
- Image response: HTTP 200, `image/jpeg`, 227,454 bytes; CDN `Last-Modified` was 20 Apr 2023. That later server timestamp does not establish when the artwork was created or which exact game build it represents.
- Dimensions: 1476 × 1804 pixels.
- Capture method: direct public HTTPS GET from the Supercell-owned `clashroyale.inbox.supercell.com` CDN after a HEAD request confirmed status, media type, and size below 5 MiB. Saved the original JPEG bytes without crop, resize, or editing.
- SHA-256: `549519bb6a4d624baa9f2ca081576fdca6b83efc19a8a492aff6374c62efa978`
- Content actually seen: a vertical promotional montage with two player Battle Banner panels, character/card artwork, names, and a blurred arena background. It does not show a real match, readable HUD, river or bridges, full towers, tile seams, or a deployment grid.
- Calibration relevance: no VIS-001 or VIS-002 bar. At most it documents the broad Battle Banner presentation described by the 2022 article. Its build/version, arena skin, framing, and UI state are not established; it cannot be used to assert 2023 parity.

## Search boundary

Screened no more than three dated official Supercell/Clash Royale article candidates listed above. Used official-site search results and article contents only. No fan wiki or third-party gameplay sources were used. No YouTube request was retried or worked around. Since the inspected image failed the actual-gameplay criterion, reconnaissance stopped without searching additional candidates.
