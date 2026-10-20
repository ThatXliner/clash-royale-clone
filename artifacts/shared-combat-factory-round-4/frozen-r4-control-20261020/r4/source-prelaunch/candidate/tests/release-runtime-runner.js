import { spawnSync } from 'node:child_process';

if ((process.argv[2] ?? 'release-runtime') !== 'release-runtime') process.exit(0);
const result = spawnSync(process.execPath, [
  '--test', new URL('./game-presentation-journey.test.js', import.meta.url).pathname,
], {
  env: { ...process.env, GAME_PRESENTATION_RELEASE: '1' },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
