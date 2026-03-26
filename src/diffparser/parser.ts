/** Represents a single action whose version ref changed. */
export interface ActionUpdate {
  action: string; // e.g. "actions/checkout"
  oldRef: string; // git ref: 40-char SHA or tag name
  newRef: string; // git ref: 40-char SHA or tag name
  oldTag: string; // human-readable version (from inline comment or tag ref itself)
  newTag: string; // human-readable version
  file: string; // workflow file path
}

/**
 * Matches a `uses:` line with owner/repo (optionally /path) @ any ref,
 * and an optional inline tag comment like `# v4.1.1`.
 *
 * Capture groups:
 *  1. action target (owner/repo or owner/repo/path)
 *  2. ref (SHA, tag, or branch)
 *  3. tag comment (optional, without the leading "# ")
 */
const usesRe =
  /uses:\s+([a-zA-Z0-9\-_.]+\/[a-zA-Z0-9\-_.]+(?:\/[^\s@]+)?)@(\S+?)(?:\s+#\s*(\S+))?\s*$/;

/** Reports whether s is a 40-character hexadecimal string. */
export function isSHA(s: string): boolean {
  if (s.length !== 40) return false;
  return /^[0-9a-f]{40}$/.test(s);
}

interface Ref {
  raw: string; // the ref as written after @
  tag: string; // from inline comment
}

function bestTag(r: Ref): string {
  if (r.tag) return r.tag;
  if (!isSHA(r.raw)) return r.raw;
  return "";
}

/**
 * Scans unified diff patches from changed workflow files and returns
 * all detected version changes. Each entry in patches maps a file path to
 * the unified diff patch text (as returned by the GitHub PR files API).
 */
export function parse(patches: Record<string, string>): ActionUpdate[] {
  const updates: ActionUpdate[] = [];
  for (const [file, patch] of Object.entries(patches)) {
    updates.push(...parsePatch(file, patch));
  }
  return updates;
}

function parsePatch(file: string, patch: string): ActionUpdate[] {
  const removed = new Map<string, Ref[]>();
  const added = new Map<string, Ref[]>();

  for (const line of patch.split("\n")) {
    if (line.length === 0) continue;

    const prefix = line[0];
    if (prefix !== "-" && prefix !== "+") continue;

    const m = usesRe.exec(line.substring(1));
    if (!m) continue;

    const action = m[1];
    const r: Ref = { raw: m[2], tag: m[3] || "" };
    const target = prefix === "-" ? removed : added;
    const existing = target.get(action) || [];
    existing.push(r);
    target.set(action, existing);
  }

  const updates: ActionUpdate[] = [];
  for (const [action, rems] of removed) {
    const adds = added.get(action) || [];
    const n = Math.min(rems.length, adds.length);
    for (let i = 0; i < n; i++) {
      if (rems[i].raw === adds[i].raw && rems[i].tag === adds[i].tag)
        continue;
      updates.push({
        action,
        oldRef: rems[i].raw,
        newRef: adds[i].raw,
        oldTag: bestTag(rems[i]),
        newTag: bestTag(adds[i]),
        file,
      });
    }
    added.delete(action);
  }
  return updates;
}
