const indirect = "./leaf.js";
export { safeLabel } from "./feature.js";
export const loadLeaf = () => import(indirect);
