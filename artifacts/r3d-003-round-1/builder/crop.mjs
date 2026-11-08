// Crop (and optionally enlarge) screenshots with macOS sips.
// Usage: node crop.mjs <x> <y> <w> <h> <scale> <in.png> <out.png> [<in2.png> <out2.png> ...]
import { execFileSync } from "node:child_process";
const [x, y, w, h, scale, ...files] = process.argv.slice(2);
for (let index = 0; index < files.length; index += 2) {
  const [input, output] = [files[index], files[index + 1]];
  execFileSync("sips", ["-c", h, w, "--cropOffset", y, x, input, "--out", output], { stdio: "ignore" });
  if (Number(scale) !== 1) {
    execFileSync("sips", ["-z", String(Math.round(h * scale)), String(Math.round(w * scale)), output, "--out", output], { stdio: "ignore" });
  }
  console.log(output);
}
