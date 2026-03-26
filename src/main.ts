import { ensure } from "./comment/comment.js";
import { fetch } from "./compare/compare.js";
import { parse, type ActionUpdate } from "./diffparser/parser.js";
import { Client } from "./github/client.js";
import { check, formatMismatch } from "./pinverify/verify.js";
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

  // 2. Filter to workflow files and collect patches.
  const patches: Record<string, string> = {};
  for (const f of files) {
    if (isWorkflowFile(f.filename) && f.patch) {
      patches[f.filename] = f.patch;
    }
  }

  if (Object.keys(patches).length === 0) {
    console.log("no workflow file changes found");
    return ensure(client, owner, repoName, pr, "");
  }

  // 3. Parse action pin changes from patches.
  let updates = parse(patches);
  if (updates.length === 0) {
    console.log("no SHA-pinned action changes detected");
    return ensure(client, owner, repoName, pr, "");
  }

  // Deduplicate updates that refer to the same comparison.
  updates = dedup(updates);

  console.log(`found ${updates.length} unique action pin update(s)`);

  // 4. Fetch comparisons.
  const results = await fetch(client, updates);

  // 5. Verify tag/SHA consistency.
  const mismatches = await check(client, updates);
  for (const m of mismatches) {
    console.warn(`warning: ${formatMismatch(m)}`);
  }

  // 6. Render comment.
  const body = comment(results, mismatches);

  // 7. Create or update PR comment.
  return ensure(client, owner, repoName, pr, body);
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
