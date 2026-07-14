import type { Result } from "../compare/compare.js";
import { updateOwnerRepo } from "../compare/compare.js";
import type { Mismatch } from "../pinverify/verify.js";
import type { DigestMismatch } from "../registry/verify.js";
import type { ActionUpdate } from "../diffparser/parser.js";

/** HTML comment used to identify bot comments. */
export const MARKER = "<!-- gha-pin-diff -->";

/** Maximum number of commits displayed per action. */
export const MAX_COMMITS_SHOWN = 15;

/**
 * Renders the full Markdown comment body for the given comparison results.
 * Returns empty string if there are no results and no mismatches.
 */
export function comment(
  results: Result[],
  mismatches: Mismatch[],
  digestMismatches: DigestMismatch[] = []
): string {
  if (
    results.length === 0 &&
    mismatches.length === 0 &&
    digestMismatches.length === 0
  )
    return "";

  results = dedup(results);
  const pinOnly: Result[] = [];
  const images: Result[] = [];
  const changed: Result[] = [];
  for (const r of results) {
    if (isImage(r)) {
      images.push(r);
      if (updateOwnerRepo(r.update) !== null && (r.err || r.totalCommits > 0)) {
        changed.push(r);
      }
    } else if (isPinOnly(r)) {
      pinOnly.push(r);
    } else {
      changed.push(r);
    }
  }

  let b = "";
  b += MARKER;
  b += "\n## 🔄 Action Pin Diff\n";

  if (mismatches.length > 0) {
    b += renderMismatches(mismatches);
  }

  if (digestMismatches.length > 0) {
    b += renderDigestMismatches(digestMismatches);
  }

  for (const r of changed) {
    b += "\n";
    b += renderResult(r);
  }

  if (images.length > 0) {
    b += renderImages(images);
  }

  if (pinOnly.length > 0) {
    b += renderPinOnly(pinOnly);
  }

  return b;
}

function dedup(results: Result[]): Result[] {
  const sorted = [...results].sort((a, b) => {
    const aKey = updateKey(a.update);
    const bKey = updateKey(b.update);
    if (aKey !== bKey) return aKey < bKey ? -1 : 1;
    return a.update.file < b.update.file
      ? -1
      : a.update.file > b.update.file
        ? 1
        : 0;
  });

  return sorted.filter(
    (r, i) =>
      i === 0 ||
      updateKey(r.update) !== updateKey(sorted[i - 1].update)
  );
}

function updateKey(u: ActionUpdate): string {
  return [
    u.action,
    u.repo ?? "",
    u.oldRef,
    u.newRef,
    u.oldTag,
    u.newTag,
    u.oldDigest ?? "",
    u.newDigest ?? "",
  ].join("\0");
}

function isPinOnly(r: Result): boolean {
  return r.err === null && r.totalCommits === 0;
}

/**
 * Reports whether r is a Docker image update. Compose images always carry a
 * home URL, including GHCR images that also map to a GitHub repository.
 */
function isImage(r: Result): boolean {
  return !!r.update.homeURL;
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

function renderImages(results: Result[]): string {
  let b = "\n### 🐳 Docker Images\n";
  b += "\n| Image | Old | New |\n";
  b += "|-------|-----|-----|\n";
  for (const r of results) {
    const u = r.update;
    const old = imageRef(u.oldTag || shortRef(u.oldRef), u.oldDigest);
    const newRef = imageRef(u.newTag || shortRef(u.newRef), u.newDigest);
    b += `| ${renderLabel(u)} | \`${old}\` | \`${newRef}\` |\n`;
  }
  return b;
}

/**
 * Formats an image reference as `tag@digest`, appending the shortened digest
 * only when the image is digest-pinned. The digest is the immutable pin, so it
 * is the part worth surfacing in review.
 */
function imageRef(tag: string, digest?: string): string {
  return digest ? `${tag}@${shortDigest(digest)}` : tag;
}

/** Shortens a `sha256:<hash>` digest to its algorithm and first 12 hex chars. */
function shortDigest(digest: string): string {
  const colon = digest.indexOf(":");
  if (colon < 0) return shortRef(digest);
  return `${digest.substring(0, colon)}:${digest.substring(colon + 1, colon + 13)}`;
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
    const expectURL = or ? `https://github.com/${or}/commit/${m.expectSHA}` : "";
    const pinnedURL = or ? `https://github.com/${or}/commit/${u.newRef}` : "";
    b += `| ${renderLabel(u)} | ${renderRef(m.tag, tagURL)} | ${renderRef(shortRef(m.expectSHA), expectURL)} | ${renderRef(shortRef(u.newRef), pinnedURL)} |\n`;
  }
  return b;
}

function renderDigestMismatches(mismatches: DigestMismatch[]): string {
  let b = "\n### ⚠️ Image Tag / Digest Mismatch\n";
  b += "\nThe following images pin a digest that the registry no longer resolves the tag to:\n";
  b += "\n| Image | Tag | Registry Digest | Pinned Digest |\n";
  b += "|-------|-----|-----------------|---------------|\n";
  for (const m of mismatches) {
    const u = m.update;
    b += `| ${renderLabel(u)} | \`${m.tag}\` | \`${shortDigest(m.expectDigest)}\` | \`${shortDigest(u.newDigest ?? "")}\` |\n`;
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

function actionRepoURL(
  update: Pick<ActionUpdate, "action" | "repo" | "homeURL">
): string | null {
  const repo = ownerRepoStr(update);
  if (repo) return "https://github.com/" + repo;
  return update.homeURL ?? null;
}

function renderLabel(
  update: Pick<ActionUpdate, "action" | "repo" | "homeURL">
): string {
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
