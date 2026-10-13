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
  "squall-orb": "Rivermark glassblowers formed the Squall Orb from stormglass swept downstream after a spring squall. Its copper collar rests on the foundry shelf, where apprentices mark the days they carried its bright shards through the rain.",
  "cinder-host": "Fifteen ember sprouts gathered in the ash beds when the Rivermark kiln first cooled for winter. At dawn, their scorched nutshell caps made a bright trail from the woodpile to the workshop door.",
  ironroot: "The oak beside Emberfall’s old foundry split when an ironstone seam surfaced through its roots. Rivermark smiths bound its crooked trunk with hammered copper and cut a broad blade from the dark seam.",
  "sunthread-pair": "When emberseed lights began appearing above the Rivermark root bridges, two woodland wardens braided copper thread through their yew bows so travelers could follow each safe trail. At dusk, the Sunthread Pair trade watch from the amber-lit fern paths and send warning arrows toward any lantern lost in the trees.",
  "duskwing-trio": "Three owl-moths hatched from a reed basket warmed beside an emberseed stove at the Emberfall river workshop. Each twilight they carry the seed’s tiny glow through the fern hollows, guiding Rivermark ferrymakers home above the water.",
  "gloamwing-cluster": "Gloamwings rise from the violet reeds at dusk to follow emberseeds down the riverbank. Five of them wheel around each warm spark until ferry bells call them home.",
  "coppershade-flock": "Coppershades roost in the offcuts piled outside the Rivermark river workshop. When the kiln wakes, all six glide over the canal and trade tiny sparks above their copper-lit nests.",
  "ember-basin": "The Ember Basin stands where the creek turns, its copper lip warmed by emberseeds carried down from the Moss & Ember workshop. At dusk, twin braces hold its long copper-ribbed launch channel above the water, ready to turn any unwelcome visitor away.",
});

export function getCardLore(cardId) {
  return CARD_LORE[cardId] ?? null;
}
