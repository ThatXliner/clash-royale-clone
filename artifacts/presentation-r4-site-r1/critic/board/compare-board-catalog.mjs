import { readFile } from 'node:fs/promises';
import { createSessionCardManifest } from '../site/input/src/content/session-card-catalog.js';
import * as catalogExports from '../site/input/src/content/index.js';

const evidencePath = new URL('./browser-evidence.json', import.meta.url);
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
const boardCards = evidence.collectionScrollEvidence.atTop.cards;
const functions = [
  'createBasicMeleeCatalog',
  'createBasicFlyingCatalog',
  'createBasicRangedCatalog',
  'createSwarmCatalog',
  'createOrdinaryProjectileSquadCatalog',
  'createOrdinaryProjectileSplashCatalog',
  'createStructureSeekerCatalog',
  'createDefensiveBuildingCatalog',
  'createResourceBuildingCatalog',
  'createInstantSpellCatalog',
];
const sourceRecords = functions.flatMap((name) => {
  const factory = catalogExports[name];
  if (typeof factory !== 'function') throw new Error(`missing source catalog ${name}`);
  return factory();
});
const sourceById = new Map(sourceRecords.map((record) => [record.id, record]));
const manifestById = new Map(createSessionCardManifest().cards.map((record) => [record.id, record]));
const kindMap = { unit: 'troop', structure: 'building', effect: 'spell' };
const expectedIds = new Set(boardCards.map(({ id }) => id));
const sessionIds = new Set(manifestById.keys());
const details = boardCards.map((board) => {
  const source = sourceById.get(board.id);
  const manifest = manifestById.get(board.id);
  return {
    id: board.id,
    board: { name: board.name, cost: Number(board.cost), rarity: board.rarity, kind: board.kind },
    source: source ? {
      name: source.displayName,
      cost: source.cost,
      rarity: source.rarity,
      kind: kindMap[source.kind] ?? source.kind,
    } : null,
    manifest: manifest ? {
      name: manifest.displayName,
      cost: manifest.cost,
      kind: kindMap[manifest.kind] ?? manifest.kind,
    } : null,
    matches: Boolean(source && manifest &&
      board.name === source.displayName &&
      Number(board.cost) === source.cost &&
      board.rarity === source.rarity &&
      board.kind === (kindMap[source.kind] ?? source.kind) &&
      board.name === manifest.displayName &&
      Number(board.cost) === manifest.cost &&
      board.kind === (kindMap[manifest.kind] ?? manifest.kind)),
  };
});
const missingSessionIds = [...expectedIds].filter((id) => !sessionIds.has(id)).sort();
const extraBoardIds = [...expectedIds].filter((id) => !sourceById.has(id)).sort();
const mismatches = details.filter(({ matches }) => !matches);
process.stdout.write(`${JSON.stringify({
  sourceCatalogs: functions,
  sourceCatalogRecordCount: sourceRecords.length,
  admittedSessionManifestRecordCount: manifestById.size,
  boardCardCount: boardCards.length,
  uniqueBoardIds: expectedIds.size,
  missingSessionIds,
  missingSourceIds: extraBoardIds,
  mismatches,
}, null, 2)}\n`);
process.exitCode = boardCards.length === 23 && expectedIds.size === 23 &&
  missingSessionIds.length === 0 && extraBoardIds.length === 0 && mismatches.length === 0 ? 0 : 1;
