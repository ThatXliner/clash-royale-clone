export const WORLD_PREMISE = "Moss & Ember is a valley of root-bridged woodland, river workshops, and copper roofs warmed by forge light. When emberseeds began glowing along forgotten paths, the valley’s makers and wanderers set out to trace where those paths led.";

const CARD_LORE = Object.freeze({
  coilblade: "A clockwork duelist was assembled from a cracked kiln bell and copper from the old riverworks. At dusk, its blade catches the forge light like a thin line of sunrise.",
  mossguard: "This grove keeper wears a shield cut from an old bough, with leaves pressed into the grain. Each leaf marks a trail the woodland guides promised to keep clear.",
  copperskiff: "The little airship began as a copper kettle patched into a hull beside the mill. Its canvas sail still carries the scent of river rain.",
  skymaul: "A stone wanderer drifted down from the cloud shelf, carrying a hammer left behind by the first valley smith. Copper bands around its arms keep little chips of rock from tumbling loose.",
  brassbolt: "The ranger made a crossbow from a brass hinge and a piece of bell metal. Amber fletching on each bolt points home to the lanterns of the foundry.",
  reedsting: "A marsh pathfinder ties reeds into a hood and the cords of each arrow. Small stitched marks on the lining count every crossing through the river grass.",
  "briar-band": "The runners and darters met in a thorn maze and chose the same leaf mark for their masks. They leave chalk arrows on the stumps so the next scout can find the way out.",
  cinderlings: "Three ember sprouts woke beneath a fallen lantern in a bed of ash. They gather sparks in nutshell caps and leave tiny lights along the stones.",
  stonehauler: "This broad pack carrier is built around a core of quarry stone, wrapped in weathered rootwood. Copper bells on its straps ring out when it reaches the river workshops.",
  thornscouts: "The four Thornscouts mark safe crossings with tiny cuts in their light blades. Pale leaf masks turn their faces into a blur among the fern paths.",
  forgeguard: "Five Forgeguard keep the river workshops supplied with hammers and axes. Their copper aprons darken at the seams, but each hammer tap keeps the old bridge pins true.",
});

export function getCardLore(cardId) {
  return CARD_LORE[cardId] ?? null;
}
