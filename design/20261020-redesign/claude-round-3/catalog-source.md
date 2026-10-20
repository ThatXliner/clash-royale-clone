# Round 3 catalog provenance

The collection was checked against immutable Git `HEAD` `c8e222da0f468e3cbe099f0e261abb4b93618aa5` with `git show HEAD:<path>`. The working-tree catalog files were not used because they differ from those HEAD blobs.

HEAD defines 19 editable troop IDs in `src/content/session-troop-roster.js` and appends four mixed-deck cards in `src/content/editable-deck.js`: one spell/effect and three buildings. That is 23 cards total. Round 2 displayed 16; Round 3 retains those 16 and adds the seven missing records below.

| ID | Display name | Kind in collection | Cost | Rarity | HEAD source |
|---|---|---|---:|---|---|
| `duskwing-trio` | Duskwing Trio | Troop | 3 | Standard | `src/content/cards/ordinary-projectile-squads.js` |
| `coppershade-flock` | Coppershade Flock | Troop | 5 | Standard | `src/content/cards/ordinary-projectile-squads.js` |
| `kilnkeeper` | Kilnkeeper | Troop | 5 | Uncommon | `src/content/cards/ordinary-projectile-splash.js` |
| `squall-orb` | Squall Orb | Spell/effect | 4 | Uncommon | `src/content/cards/special-movement-knockback.js` |
| `ember-basin` | Ember Basin | Building | 4 | Uncommon | `src/content/cards/buildings-defensive.js` |
| `buried-coil` | Buried Coil | Building | 4 | Standard | `src/content/cards/buildings-defensive.js` |
| `aether-well` | Aether Well | Building | 6 | Uncommon | `src/content/cards/buildings-resource.js` |

The seven records above are source-backed. Their tile art is still a placeholder. The 16 retained Round 2 records keep their existing visual treatments, including Stonehauler as **Uncommon** and Sunthread Pair as **Standard**.

## HEAD blob IDs

| Source | Blob |
|---|---|
| `src/content/session-troop-roster.js` | `75fb7af5675c25e418bb06483bcf84d67eda1a4d` |
| `src/content/editable-deck.js` | `cdfb7f081400b8a4f797f0cf577a6923c6004347` |
| `src/content/cards/ordinary-projectile-squads.js` | `ffaa243a599e7466e47c32c281af04a1def8e9bb` |
| `src/content/cards/ordinary-projectile-splash.js` | `b0eb9b1a2454dd5b49792bf8a404bf2ba549d67e` |
| `src/content/cards/special-movement-knockback.js` | `1bc4ede449d5de5b99851c6cea73c3b00996a3f2` |
| `src/content/cards/buildings-defensive.js` | `253a2008584e95b1d42e852a3f5cafe2e20b8622` |
| `src/content/cards/buildings-resource.js` | `0a09201295c073c1194245c94334e31b7b8c2daf` |
