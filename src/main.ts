import { ensure } from "./comment/comment.js";
import { fetch } from "./compare/compare.js";
import { parse, type ActionUpdate } from "./diffparser/parser.js";
import { APIError, Client } from "./github/client.js";
import { resolveLazyLockRepos as resolveLazyLockReposInWorkspace } from "./lazy/plugins.js";
import { check, formatMismatch } from "./pinverify/verify.js";
import { RegistryClient } from "./registry/client.js";
import { check as checkImages, formatDigestMismatch } from "./registry/verify.js";
import { comment } from "./render/render.js";
import path from "node:path";
import { readFileSync } from "node:fs";

function getInput(name: string): string | undefined {
  return process.env[`INPUT_${name.toUpperCase()}`];
}

async function run(): Promise<void> {
  const token =
    getInput("GITHUB-TOKEN") ?? process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required");

  const repo = process.env.GITHUB_REPOSITORY; // "owner/repo"
  if (!repo) throw new Error("GITHUB_REPOSITORY is required");

  const slashIdx = repo.indexOf("/");
  if (slashIdx < 0) throw new Error(`invalid GITHUB_REPOSITORY: "${repo}"`);
  const owner = repo.substring(0, slashIdx);
  const repoName = repo.substring(slashIdx + 1);

  const pr = getPRNumber();

  const client = new Client(token);

  // 1. Fetch changed files in the PR.
  const files = await client.listPRFiles(owner, repoName, pr);

  // 2. Filter to supported files and collect patches.
  const patches: Record<string, string> = {};
  for (const f of files) {
    if (isSupportedFile(f.filename) && f.patch) {
      patches[f.filename] = f.patch;
    }
  }

  if (Object.keys(patches).length === 0) {
    console.log("no supported file changes found");
    return ensure(client, owner, repoName, pr, "");
  }

  // 3. Parse pinned ref changes from patches.
  let updates = parse(patches);
  updates = resolveLazyLockRepos(updates);
  if (updates.length === 0) {
    console.log("no pinned ref changes detected");
    return ensure(client, owner, repoName, pr, "");
  }

  // Deduplicate updates that refer to the same comparison.
  updates = dedup(updates);

  console.log(`found ${updates.length} unique pin update(s)`);

  // 4. Fetch comparisons.
  const results = await fetch(client, updates);

  // 5. Verify tag/SHA consistency.
  const mismatches = await check(client, updates);
  for (const m of mismatches) {
    console.warn(`warning: ${formatMismatch(m)}`);
  }

  // 5b. Verify Compose image tags still resolve to their pinned digests.
  const digestMismatches = await checkImages(new RegistryClient(), updates);
  for (const m of digestMismatches) {
    console.warn(`warning: ${formatDigestMismatch(m)}`);
  }

  // 6. Render comment.
  const body = comment(results, mismatches, digestMismatches);

  // 7. Create or update PR comment.
  try {
    return await ensure(client, owner, repoName, pr, body);
  } catch (err) {
    if (isCommentPermissionError(err)) {
      console.log(`::warning::${formatCommentPermissionError(err)}`);
      return;
    }
    throw err;
  }
}

function isCommentPermissionError(err: unknown): err is APIError {
  return (
    err instanceof APIError &&
    err.statusCode === 403 &&
    /\/issues(?:\/comments)?(?:\?|$)/.test(err.url) &&
    err.body.includes("Resource not accessible by integration")
  );
}

function formatCommentPermissionError(err: APIError): string {
  return [
    "unable to post PR comment with the current token",
    "GitHub returned 403 Resource not accessible by integration",
    "this commonly happens on pull requests from forks or Dependabot runs without comment permissions",
    "grant pull-requests: write or run in a context with a writable token",
  ].join("; ");
}

function getPRNumber(): number {
  // Try PR_NUMBER env var first (backwards compat).
  const s = process.env.PR_NUMBER;
  if (s) {
    const n = parseInt(s, 10);
    if (!isNaN(n)) return n;
  }

  // Fall back to GITHUB_EVENT_PATH (standard for node actions).
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath) {
    try {
      const event = JSON.parse(readFileSync(eventPath, "utf-8"));
      const num = event?.pull_request?.number ?? event?.number;
      if (typeof num === "number") return num;
    } catch {
      // ignore parse errors
    }
  }

  throw new Error(
    "PR_NUMBER is not set and could not be read from GITHUB_EVENT_PATH"
  );
}

function isWorkflowFile(filePath: string): boolean {
  const dir = path.dirname(filePath);
  return (
    dir === ".github/workflows" || dir.startsWith(".github/workflows/")
  );
}

function isLazyLockFile(filePath: string): boolean {
  return filePath === "lazy-lock.json" || filePath.endsWith("/lazy-lock.json");
}

function isComposeFile(filePath: string): boolean {
  const base = filePath.substring(filePath.lastIndexOf("/") + 1);
  return /^(docker-)?compose(\.[^/]+)?\.ya?ml$/.test(base);
}

function isSupportedFile(filePath: string): boolean {
  return (
    isWorkflowFile(filePath) ||
    isLazyLockFile(filePath) ||
    isComposeFile(filePath)
  );
}

function resolveLazyLockRepos(updates: ActionUpdate[]): ActionUpdate[] {
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  return resolveLazyLockReposInWorkspace(workspace, updates);
}

function dedup(updates: ActionUpdate[]): ActionUpdate[] {
  const seen = new Set<string>();
  const out: ActionUpdate[] = [];
  for (const u of updates) {
    const k = `${u.action}\0${u.oldRef}\0${u.newRef}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(u);
  }
  return out;
}

run().catch((err) => {
  console.error(`error: ${err}`);
  process.exit(1);
});
