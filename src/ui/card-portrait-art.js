const CARD_PORTRAITS = Object.freeze({
  coilblade: Object.freeze({ asset: "card-portraits-painted", cell: 0 }),
  mossguard: Object.freeze({ asset: "card-portraits-painted", cell: 1 }),
  copperskiff: Object.freeze({ asset: "card-portraits-painted", cell: 2 }),
  skymaul: Object.freeze({ asset: "card-portraits-painted", cell: 3 }),
  brassbolt: Object.freeze({ asset: "card-portraits-painted", cell: 4 }),
  reedsting: Object.freeze({ asset: "card-portraits-painted", cell: 5 }),
  "briar-band": Object.freeze({ asset: "card-portraits-painted", cell: 6 }),
  cinderlings: Object.freeze({ asset: "card-portraits-painted", cell: 7 }),
  stonehauler: Object.freeze({ asset: "stonehauler-painted", cell: null }),
  thornscouts: Object.freeze({ asset: "thornscouts-painted", cell: null }),
  forgeguard: Object.freeze({ asset: "forgeguard-painted", cell: null }),
  "squall-orb": Object.freeze({ asset: "squall-orb-painted", cell: null }),
  "cinder-host": Object.freeze({ asset: "cinder-host-painted", cell: null }),
  ironroot: Object.freeze({ asset: "ironroot-painted", cell: null }),
});

const PORTRAIT_ASSET_PATHS = Object.freeze({
  "card-portraits-painted": new URL(
    "../../public/assets/card-portraits-painted.webp",
    import.meta.url,
  ).href,
  "stonehauler-painted": new URL(
    "../../public/assets/stonehauler-painted.webp",
    import.meta.url,
  ).href,
  "thornscouts-painted": new URL(
    "../../public/assets/thornscouts-painted.webp",
    import.meta.url,
  ).href,
  "forgeguard-painted": new URL(
    "../../public/assets/forgeguard-painted.webp",
    import.meta.url,
  ).href,
  "squall-orb-painted": new URL(
    "../../public/assets/squall-orb-painted.webp",
    import.meta.url,
  ).href,
  "cinder-host-painted": new URL(
    "../../public/assets/cinder-host-painted.webp",
    import.meta.url,
  ).href,
  "ironroot-painted": new URL(
    "../../public/assets/ironroot-painted.webp",
    import.meta.url,
  ).href,
});

export function getCardPortrait(cardId) {
  if (typeof cardId !== "string" || !Object.hasOwn(CARD_PORTRAITS, cardId)) {
    return null;
  }
  const portrait = CARD_PORTRAITS[cardId];
  return Object.freeze({
    ...portrait,
    src: PORTRAIT_ASSET_PATHS[portrait.asset],
  });
}

export function getCardPortraitIds() {
  return Object.keys(CARD_PORTRAITS);
}
