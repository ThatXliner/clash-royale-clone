import { spawnSync } from 'node:child_process';
if ((process.argv[2] ?? 'game-presentation-journey') !== 'game-presentation-journey') process.exit(0);
const result = spawnSync(process.execPath, ['--test', new URL('./game-presentation-journey.test.js', import.meta.url).pathname], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
