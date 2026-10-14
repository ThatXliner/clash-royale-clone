import { writeFile } from "node:fs/promises";

const repository = "ThatXliner/clash-royale-clone";
const workflowRunId = 38501010696;
const expectedMainSha = "dbd7afe4a8901b5b61c83ebc92137a5bd26e5451";
const headers = { "user-agent": "coverage004-evidence-check" };

async function readJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return { body: await response.json(), response };
}

async function checkHead(url) {
  const response = await fetch(url, { method: "HEAD", redirect: "follow" });
  return {
    url,
    status: response.status,
    contentType: response.headers.get("content-type"),
    lastModified: response.headers.get("last-modified"),
  };
}

const [runResult, jobsResult, mainResult, landing, game] = await Promise.all([
  readJson(`https://api.github.com/repos/${repository}/actions/runs/${workflowRunId}`),
  readJson(`https://api.github.com/repos/${repository}/actions/runs/${workflowRunId}/jobs?per_page=100`),
  readJson(`https://api.github.com/repos/${repository}/commits?sha=main&per_page=1`),
  checkHead("https://bryanhu.com/clash-royale-clone/"),
  checkHead("https://bryanhu.com/clash-royale-clone/game/public/index.html"),
]);

const run = runResult.body;
const jobs = jobsResult.body.jobs.map(({ name, status, conclusion, html_url }) => ({
  name, status, conclusion, url: html_url,
}));
const mainSha = mainResult.body[0]?.sha ?? null;
const receipt = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  repository,
  main: {
    branch: "main",
    sha: mainSha,
    expectedReviewedSha: expectedMainSha,
    matchesExpected: mainSha === expectedMainSha,
    commitUrl: `https://github.com/${repository}/commit/${mainSha}`,
  },
  workflow: {
    id: run.id,
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
    headBranch: run.head_branch,
    headSha: run.head_sha,
    url: run.html_url,
    jobs,
  },
  livePages: { landing, game },
};

await writeFile(new URL("./live-release-check.json", import.meta.url), `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
if (mainSha !== expectedMainSha || run.head_sha !== expectedMainSha ||
    run.status !== "completed" || run.conclusion !== "success" ||
    jobs.some((job) => job.status !== "completed" || job.conclusion !== "success") ||
    landing.status !== 200 || game.status !== 200) {
  process.exitCode = 1;
}
