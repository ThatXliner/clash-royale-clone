import { pathToFileURL } from 'node:url';
const sharedViteEntry = '/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/vite/dist/node/index.js';
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'vite') return { url: pathToFileURL(sharedViteEntry).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
