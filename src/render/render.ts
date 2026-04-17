import type { Result } from "../compare/compare.js";
import { updateOwnerRepo } from "../compare/compare.js";
import type { Mismatch } from "../pinverify/verify.js";
import type { ActionUpdate } from "../diffparser/parser.js";

/** HTML comment used to identify bot comments. */
export const MARKER = "<!-- gha-pin-diff -->";

/** Maximum number of commits displayed per action. */
export const MAX_COMMITS_SHOWN = 15;

/**
 * Renders the full Markdown comment body for the given comparison results.
 * Returns empty string if there are no results and no mismatches.
 */
export function comment(results: Result[], mismatches: Mismatch[]): string {
  if (results.length === 0 && mismatches.length === 0) return "";

  results = dedup(results);
  const mismatchKeys = new Set(
    mismatches.map((m) => `${m.update.action}\0${m.update.newRef}`),
  );
  const pinOnly: Result[] = [];
  const changed: Result[] = [];
  for (const r of results) {
    if (isPinOnly(r) && !mismatchKeys.has(`${r.update.action}\0${r.update.newRef}`)) {
      pinOnly.push(r);
    } else if (!isPinOnly(r)) {
      changed.push(r);
    }
  }

  let b = "";
  b += MARKER;
  b += "\n## 🔄 Action Pin Diff\n";

  if (mismatches.length > 0) {
    b += renderMismatches(mismatches);
  }

  for (const r of changed) {
    b += "\n";
    b += renderResult(r);
  }

  if (pinOnly.length > 0) {
    b += renderPinOnly(pinOnly);
  }

  return b;
}

function dedup(results: Result[]): Result[] {
  const sorted = [...results].sort((a, b) => {
    if (a.update.action !== b.update.action)
      return a.update.action < b.update.action ? -1 : 1;
    if (a.update.oldRef !== b.update.oldRef)
      return a.update.oldRef < b.update.oldRef ? -1 : 1;
    if (a.update.newRef !== b.update.newRef)
      return a.update.newRef < b.update.newRef ? -1 : 1;
    return a.update.file < b.update.file
      ? -1
      : a.update.file > b.update.file
        ? 1
        : 0;
  });

  return sorted.filter(
    (r, i) =>
      i === 0 ||
      r.update.action !== sorted[i - 1].update.action ||
      r.update.oldRef !== sorted[i - 1].update.oldRef ||
      r.update.newRef !== sorted[i - 1].update.newRef
  );
}

function isPinOnly(r: Result): boolean {
  return r.err === null && r.totalCommits === 0;
}

function ownerRepoStr(update: Pick<ActionUpdate, "action" | "repo">): string | null {
  const parsed = updateOwnerRepo(update);
  return parsed ? parsed.join("/") : null;
}

function renderPinOnly(results: Result[]): string {
  let b = "\n### 📌 Pinned (digest unchanged)\n";
  b += "\n| Action | Version | Digest |\n";
  b += "|--------|---------|--------|\n";
  for (const r of results) {
    const u = r.update;
    let tag = u.newTag || u.oldTag;
    if (!tag) tag = shortRef(u.newRef);
    const repo = ownerRepoStr(u);
    const commitURL = repo ? `https://github.com/${repo}/commit/${u.newRef}` : "";
    b += `| ${renderLabel(u)} | \`${tag}\` | ${renderRef(shortRef(u.newRef), commitURL)} |\n`;
  }
  return b;
}

function renderMismatches(mismatches: Mismatch[]): string {
  let b = "\n### ⚠️ Tag / SHA Mismatch\n";
  b += "\nThe following pins reference a SHA that does not match the tag in the comment:\n";
  b += "\n| Action | Tag | Expected SHA | Pinned SHA |\n";
  b += "|--------|-----|-------------|------------|\n";
  for (const m of mismatches) {
    const u = m.update;
    const or = ownerRepoStr(u);
    const tagURL = or ? `https://github.com/${or}/releases/tag/${m.tag}` : "";
    const pinnedURL = or ? `https://github.com/${or}/commit/${u.newRef}` : "";
    let expectCell: string;
    if (m.expectSHA) {
      const expectURL = or ? `https://github.com/${or}/commit/${m.expectSHA}` : "";
      expectCell = renderRef(shortRef(m.expectSHA), expectURL);
    } else {
      expectCell = "*tag not found*";
    }
    b += `| ${renderLabel(u)} | ${renderRef(m.tag, tagURL)} | ${expectCell} | ${renderRef(shortRef(u.newRef), pinnedURL)} |\n`;
  }
  return b;
}

function renderResult(r: Result): string {
  const u = r.update;
  const repo = ownerRepoStr(u);

  let b = `### ${renderLabel(u)}`;
  if (u.oldTag || u.newTag) {
    const old = u.oldTag || shortRef(u.oldRef);
    const newTag = u.newTag || shortRef(u.newRef);
    b += ` \`${old}\` → \`${newTag}\``;
  }
  b += "\n";

  if (r.err) {
    b += `\n⚠️ Could not fetch comparison: ${r.err.message}\n`;
    b += `\nRefs: \`${shortRef(u.oldRef)}\` → \`${shortRef(u.newRef)}\`\n`;
    if (repo) {
      b += `\n[View diff manually](https://github.com/${repo}/compare/${u.oldRef}...${u.newRef})\n`;
    }
    return b;
  }

  const commitWord = r.totalCommits === 1 ? "commit" : "commits";
  b += `\n**${r.totalCommits} ${commitWord}**`;
  if (r.compareURL) {
    b += ` · [Compare](${r.compareURL})`;
  }
  b += "\n";

  if (r.commits.length === 0) return b;

  const or = ownerRepoStr(u);
  b += "\n| SHA | Message | Date |\n";
  b += "|-----|---------|------|\n";

  let shown = r.commits;
  if (shown.length > MAX_COMMITS_SHOWN) {
    shown = shown.slice(shown.length - MAX_COMMITS_SHOWN);
  }

  for (const c of shown) {
    const sha = shortRef(c.sha);
    const commitURL = or ? `https://github.com/${or}/commit/${c.sha}` : "";
    const date = c.date ? formatDate(c.date) : "";
    let msg = escapeMarkdown(c.message);
    if (msg.length > 80) {
      msg = msg.substring(0, 77) + "...";
    }
    b += `| ${renderRef(sha, commitURL)} | ${msg} | ${date} |\n`;
  }

  if (r.totalCommits > MAX_COMMITS_SHOWN) {
    b += `\n*Showing ${MAX_COMMITS_SHOWN} of ${r.totalCommits} commits. [View all](${r.compareURL})*\n`;
  }

  return b;
}

function actionRepoURL(update: Pick<ActionUpdate, "action" | "repo">): string | null {
  const repo = ownerRepoStr(update);
  return repo ? "https://github.com/" + repo : null;
}

function renderLabel(update: Pick<ActionUpdate, "action" | "repo">): string {
  return renderRef(update.action, actionRepoURL(update));
}

function renderRef(text: string, url: string | null): string {
  return url ? `[\`${text}\`](${url})` : `\`${text}\``;
}

function escapeMarkdown(s: string): string {
  return s.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function shortRef(ref: string): string {
  return ref.length > 7 ? ref.substring(0, 7) : ref;
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
