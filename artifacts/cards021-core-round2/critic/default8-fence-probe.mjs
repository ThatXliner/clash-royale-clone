import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

const { createRLEnvironment } = await import(pathToFileURL(
  `${process.cwd()}/src/rl/environment.js`,
));
for (const seed of [0, 23]) {
  const env = createRLEnvironment({ seed });
  const rl = env.serialize();
  const wrapper = JSON.parse(rl);
  const session = JSON.parse(wrapper.session);
  console.log(JSON.stringify({
    seed,
    rlBytes: Buffer.byteLength(rl),
    rlSha256: hash(rl),
    sessionSha256: hash(wrapper.session),
    setupSha256: hash(canonical(session.setup)),
    setupType: typeof session.setup,
    observationStructureCount: env.observe().structures.length,
  }));
}
