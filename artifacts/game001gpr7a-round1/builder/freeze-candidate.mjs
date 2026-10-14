import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = process.cwd();
const out = path.join(repo, 'artifacts/game001gpr7a-round1/builder');
const expectedCommit = 'ff1025e145cbff421d624ed7d3e59b5ab5671f14';
const expectedDefaultSha = '306bb30da40ce7c43d6cccce8728449da90fc0e9ca7d13c81f0116ba710aec8c';
const expectedKilnkeeperSha = '9b2a1c5a86c2d5c0c2d623389b69c465409e65d5d84988591630b980ee7b3ba9';
const sh = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const tracked = sh(['ls-files', '-z']).split('\0').filter(Boolean);
const trackedOutsideBuilder = tracked.filter((file) => !file.startsWith('artifacts/game001gpr7a-round1/builder/'));
const head = sh(['rev-parse', 'HEAD']);
const tree = sh(['rev-parse', 'HEAD^{tree}']);
if (head !== expectedCommit) throw new Error(`candidate HEAD mismatch: ${head}`);
if (sh(['diff', '--quiet', 'HEAD', '--', 'src', 'tests', 'public/assets', 'package.json', 'package-lock.json']) !== '') {
  throw new Error('tracked candidate source changed');
}
const dirtyTracked = sh(['diff', '--name-only', 'HEAD', '--', 'src', 'tests', 'public/assets', 'package.json', 'package-lock.json']);
if (dirtyTracked !== '') throw new Error(`tracked candidate source is dirty: ${dirtyTracked}`);

const readList = async (files) => Promise.all(files.map(async (file) => {
  const bytes = await readFile(path.join(repo, file));
  return { path: file, bytes: bytes.length, sha256: sha256(bytes) };
}));
const sourceFiles = trackedOutsideBuilder.filter((file) => file.startsWith('src/'));
const publicFiles = trackedOutsideBuilder.filter((file) => file.startsWith('public/'));
const assetFiles = trackedOutsideBuilder.filter((file) => file.startsWith('public/assets/'));
const allTestFiles = trackedOutsideBuilder.filter((file) => file.startsWith('tests/'));
const browserHarnessPaths = [
  'package.json',
  'package-lock.json',
  'tests/endurance-workload.test.js',
  'tests/game-browser-endurance-runner.js',
  'tests/game-browser-endurance-server.js',
  'tests/game-browser-endurance.html',
  'tests/game-browser-endurance.test.js',
  'tests/helpers/endurance-workload.js',
];
for (const file of browserHarnessPaths) {
  if (!trackedOutsideBuilder.includes(file)) throw new Error(`missing pinned harness file: ${file}`);
}
const sourceEntries = await readList(sourceFiles);
const publicEntries = await readList(publicFiles);
const assetEntries = await readList(assetFiles);
const testEntries = await readList(allTestFiles);
const harnessEntries = await readList(browserHarnessPaths);
const packageLockEntry = harnessEntries.find(({ path: p }) => p === 'package-lock.json');

const helper = await import(pathToFileURL(path.join(repo, 'tests/helpers/endurance-workload.js')));
const rosterModule = await import(pathToFileURL(path.join(repo, 'src/content/playable-roster.js')));
const deckModule = await import(pathToFileURL(path.join(repo, 'src/content/editable-deck.js')));
const defaultBytes = helper.exactEnduranceSetupBytes();
const kilnkeeperBytes = helper.exactKilnkeeperEnduranceSetupBytes();
const defaultSha = sha256(defaultBytes);
const kilnkeeperSha = sha256(kilnkeeperBytes);
if (defaultSha !== expectedDefaultSha) throw new Error(`default setup hash mismatch: ${defaultSha}`);
if (kilnkeeperSha !== expectedKilnkeeperSha) throw new Error(`Kilnkeeper setup hash mismatch: ${kilnkeeperSha}`);
await writeFile(path.join(out, 'default-eight-setup.canonical.json'), defaultBytes, 'utf8');
await writeFile(path.join(out, 'kilnkeeper-setup.canonical.json'), kilnkeeperBytes, 'utf8');

const defaultSetup = JSON.parse(defaultBytes);
const kilnkeeperSetup = JSON.parse(kilnkeeperBytes);
const mixedChoices = [...deckModule.EDITABLE_MIXED_DECK_CARD_IDS];
const troopChoices = [...deckModule.EDITABLE_DECK_CARD_IDS];
if (mixedChoices.length !== 20 || troopChoices.length !== 18 || rosterModule.PLAYABLE_CARD_IDS.length !== 8) {
  throw new Error(`unexpected roster scope: mixed=${mixedChoices.length}, troops=${troopChoices.length}, default=${rosterModule.PLAYABLE_CARD_IDS.length}`);
}

const packageJson = JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8'));
const lockJson = JSON.parse(await readFile(path.join(repo, 'package-lock.json'), 'utf8'));
const installedPlaywright = JSON.parse(await readFile(path.join(repo, 'node_modules/playwright/package.json'), 'utf8'));
const installedVite = JSON.parse(await readFile(path.join(repo, 'node_modules/vite/package.json'), 'utf8'));
let npmLs;
try {
  npmLs = JSON.parse(execFileSync('npm', ['ls', '--depth=0', '--json'], { cwd: repo, encoding: 'utf8' }));
} catch (error) {
  throw new Error(`npm ls --depth=0 failed: ${error.stdout ?? ''}${error.stderr ?? ''}`);
}
const hiddenLock = JSON.parse(await readFile(path.join(repo, 'node_modules/.package-lock.json'), 'utf8'));
const lockedPackages = lockJson.packages ?? {};
const installedPackages = hiddenLock.packages ?? {};
const packageLockComparison = {
  packageEntries: Object.keys(lockedPackages).length,
  installedEntries: Object.keys(installedPackages).length,
  missingNonOptional: [],
  versionMismatches: [],
  extraInstalled: [],
};
for (const [packagePath, locked] of Object.entries(lockedPackages)) {
  if (!packagePath || locked.link) continue;
  const installed = installedPackages[packagePath];
  if (installed === undefined) {
    if (!locked.optional) packageLockComparison.missingNonOptional.push(packagePath);
    continue;
  }
  if (installed.version !== locked.version) {
    packageLockComparison.versionMismatches.push({ path: packagePath, locked: locked.version, installed: installed.version });
  }
}
for (const packagePath of Object.keys(installedPackages)) {
  if (packagePath && !(packagePath in lockedPackages)) packageLockComparison.extraInstalled.push(packagePath);
}
if (packageLockComparison.missingNonOptional.length || packageLockComparison.versionMismatches.length || packageLockComparison.extraInstalled.length) {
  throw new Error(`private node_modules differs from package lock: ${JSON.stringify(packageLockComparison)}`);
}
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chromeVersion = execFileSync(chromePath, ['--version'], { encoding: 'utf8' }).trim();
const environment = {
  repo: repo,
  gitCommit: head,
  gitTree: tree,
  cleanTrackedCandidatePaths: true,
  node: process.version,
  npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
  platform: process.platform,
  architecture: process.arch,
  chromePath,
  chromeVersion,
  playwright: { package: 'playwright', packageLock: packageJson.devDependencies.playwright, installed: installedPlaywright.version },
  vite: { package: 'vite', packageLock: packageJson.devDependencies.vite, installed: installedVite.version },
  npmLsDepth0: npmLs.dependencies,
  packageLockComparison,
  note: 'Preparation evidence only. No build, browser test, simulation, or endurance run was performed.'
};

const fileManifest = {
  schema: 'game001gpr7a-source-cut-v1',
  candidateCommit: head,
  candidateTree: tree,
  candidateStatus: 'clean tracked candidate source; generated artifacts are under this builder directory only',
  counts: {
    srcTrackedFiles: sourceEntries.length,
    publicTrackedFiles: publicEntries.length,
    publicAssetTrackedFiles: assetEntries.length,
    allTrackedTestFiles: testEntries.length,
    pinnedBrowserHarnessFiles: harnessEntries.length,
  },
  src: sourceEntries,
  public: publicEntries,
  publicAssets: assetEntries,
  testsAll: testEntries,
  browserHarness: harnessEntries,
  packageLockSha256: packageLockEntry.sha256,
};
await writeFile(path.join(out, 'source-cut-manifest.json'), `${JSON.stringify(fileManifest, null, 2)}\n`);
await writeFile(path.join(out, 'environment-manifest.json'), `${JSON.stringify(environment, null, 2)}\n`);

const setups = {
  schema: 'game001gpr7a-canonical-setups-v1',
  sourceCommit: head,
  defaultEight: {
    bytes: Buffer.byteLength(defaultBytes),
    sha256: defaultSha,
    deck: defaultSetup.deck,
    setup: JSON.parse(defaultBytes),
  },
  kilnkeeper: {
    bytes: Buffer.byteLength(kilnkeeperBytes),
    sha256: kilnkeeperSha,
    selectedDeck: [...helper.KILNKEEPER_ENDURANCE_DECK],
    acceptedSetupDeck: kilnkeeperSetup.deck,
    setup: JSON.parse(kilnkeeperBytes),
  },
  editableChoices: {
    count: mixedChoices.length,
    cardIds: mixedChoices,
    troopChoiceIds: troopChoices,
    nonTroopMixedChoiceIds: mixedChoices.filter((id) => !troopChoices.includes(id)),
  },
};
await writeFile(path.join(out, 'canonical-setup-manifest.json'), `${JSON.stringify(setups, null, 2)}\n`);

const scope = {
  schema: 'game001gpr7a-source-host-scope-v1',
  sourceCommit: head,
  execution: 'Native browser ESM served from the repository root by tests/game-browser-endurance-server.js; no built dist or release bundle is consumed.',
  browserPage: '/tests/game-browser-endurance.html',
  sourceHostedPaths: [
    '/src/sim/game-session.js',
    '/src/ui/game-browser-entry.js',
    '/src/audio/game-audio-runtime.js',
    '/src/sim/deck.js',
    '/src/sim/elixir.js',
    '/src/ui/arena-shell.css',
  ],
  pinnedHarnessPaths: browserHarnessPaths,
  fullStaticTestHashWalk: 'Every tracked tests/** file is listed in source-cut-manifest.json; only pinnedBrowserHarnessPaths are invoked by the endurance runner.',
  relevantRuntimeCaps: {
    requiredDefaultTick: 18000,
    maximumExplicitTickBound: 18000,
    reactionPolicyTicks: 15,
    baselineRestoreTicks: 300,
    emergencyCooldownTicks: 300,
    maxBrowserLongTaskMilliseconds: 50,
    maxInitializationLongTaskMilliseconds: 300,
    maxExplicitSimulationSliceMilliseconds: 40,
    maxSegmentMilliseconds: 30000,
    maximumTotalDurationMilliseconds: 1200000,
    maxSegmentTicks: 300,
    presentationEveryTicks: 100,
    ticksPerDriveChunk: 1,
  },
  scenarioControl: {
    defaultEight: 'GAME_BROWSER_ENDURANCE_SCENARIO unset; GAME_BROWSER_ENDURANCE_TICKS unset; exact default setup hash is asserted by source harness.',
    kilnkeeper: 'GAME_BROWSER_ENDURANCE_SCENARIO=kilnkeeper; GAME_BROWSER_ENDURANCE_TICKS unset; requires reaching the natural terminal no later than the source-defined 18000-tick cap.',
  },
  artifacts: 'GAME_BROWSER_ENDURANCE_ARTIFACTS is directed into separate critic/default-eight and critic/kilnkeeper folders under this private clone.',
};
await writeFile(path.join(out, 'source-host-scope.json'), `${JSON.stringify(scope, null, 2)}\n`);

const defaultCommand = `env -u GAME_BROWSER_ENDURANCE_TICKS -u GAME_BROWSER_ENDURANCE_SCENARIO \\
  GAME_BROWSER_PLAYWRIGHT=${repo}/node_modules/playwright/index.mjs \\
  GAME_BROWSER_CHROME="${chromePath}" \\
  GAME_BROWSER_ENDURANCE_ARTIFACTS=${repo}/artifacts/game001gpr7a-round1/critic/default-eight/ \\
  npm run test:game-browser-endurance`;
const kilnkeeperCommand = `env -u GAME_BROWSER_ENDURANCE_TICKS \\
  GAME_BROWSER_ENDURANCE_SCENARIO=kilnkeeper \\
  GAME_BROWSER_PLAYWRIGHT=${repo}/node_modules/playwright/index.mjs \\
  GAME_BROWSER_CHROME="${chromePath}" \\
  GAME_BROWSER_ENDURANCE_ARTIFACTS=${repo}/artifacts/game001gpr7a-round1/critic/kilnkeeper/ \\
  npm run test:game-browser-endurance`;
await writeFile(path.join(out, 'run-commands.txt'), `# Run from ${repo}\n# Default-eight: full source-defined 18000 ticks; both bound/scenario overrides are unset.\n${defaultCommand}\n\n# Kilnkeeper: natural terminal with source-defined maximum 18000 ticks; no tick override.\n${kilnkeeperCommand}\n`);

const prep = `# GPR7A accepted-source preparation\n\nCandidate: \`${head}\` (tree \`${tree}\`) in clean private clone \`${repo}\`.\n\nThis is a source and environment freeze for a fresh critic. It does not claim that the candidate compiled, passed an endurance run, or met browser performance bounds. No build, browser run, simulation, or benchmark was started in this preparation step.\n\nThe complete tracked source and asset hash walk is in [source-cut-manifest.json](source-cut-manifest.json): ${sourceEntries.length} tracked \`src/**\` files, ${publicEntries.length} tracked \`public/**\` files (${assetEntries.length} beneath \`public/assets/**\`), and ${testEntries.length} tracked \`tests/**\` files. The exact browser harness and package lock are separately identified there. Canonical default and Kilnkeeper setup bytes are preserved and hashed in [canonical-setup-manifest.json](canonical-setup-manifest.json). The selectable catalog is ${mixedChoices.length} choices (${troopChoices.length} troop choices and ${mixedChoices.length - troopChoices.length} additional mixed-deck choices); default setup is the seed-zero shipped eight, and the expanded setup uses \`${helper.KILNKEEPER_ENDURANCE_DECK.join(', ')}\`.\n\nThe environment is recorded in [environment-manifest.json](environment-manifest.json). It uses Node ${process.version}, npm ${environment.npm}, Playwright ${installedPlaywright.version}, and ${chromeVersion}. The local copied dependency tree matches every non-optional package entry in \`package-lock.json\`; no package install was run.\n\nThe browser harness serves native source modules from the repository root, including \`/src/sim/game-session.js\`, \`/src/ui/game-browser-entry.js\`, \`/src/audio/game-audio-runtime.js\`, and \`/src/ui/arena-shell.css\`. It does not consume a compiled release or Pages bundle. The scope and unchanged caps are in [source-host-scope.json](source-host-scope.json).\n\nUse the commands in [run-commands.txt](run-commands.txt) unchanged. They keep the full default 18,000 tick bound and the Kilnkeeper scenario’s natural-terminal condition, and write results only beneath this private clone’s \`artifacts/game001gpr7a-round1/critic/**\`. The old GPR7 prep at candidate 88 is historical and does not establish current-source qualification.\n`;
await writeFile(path.join(out, 'preparation.md'), prep);
const manifestFiles = [
  'source-cut-manifest.json', 'environment-manifest.json', 'canonical-setup-manifest.json',
  'source-host-scope.json', 'run-commands.txt', 'preparation.md',
  'default-eight-setup.canonical.json', 'kilnkeeper-setup.canonical.json', 'freeze-candidate.mjs',
];
const manifestEntries = await readList(manifestFiles.map((file) => path.relative(repo, path.join(out, file))));
await writeFile(path.join(out, 'artifact-files.sha256'), manifestEntries.map(({ sha256, path: file }) => `${sha256}  ${file}`).join('\n') + '\n');

console.log(JSON.stringify({ repo, head, tree, sourceFiles: sourceEntries.length, publicAssets: assetEntries.length,
  allTrackedTests: testEntries.length, pinnedBrowserHarness: harnessEntries.length,
  packageLockSha256: packageLockEntry.sha256, defaultSetupSha256: defaultSha,
  kilnkeeperSetupSha256: kilnkeeperSha, editableChoices: mixedChoices.length,
  environment: { node: process.version, npm: environment.npm, chrome: chromeVersion,
    playwright: installedPlaywright.version, vite: installedVite.version }, out }, null, 2));
