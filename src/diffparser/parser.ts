/** Represents a single action whose version ref changed. */
export interface ActionUpdate {
  action: string; // e.g. "actions/checkout"
  oldRef: string; // git ref: 40-char SHA or tag name
  newRef: string; // git ref: 40-char SHA or tag name
  oldTag: string; // human-readable version (from inline comment or tag ref itself)
  newTag: string; // human-readable version
  file: string; // workflow file path
}

/** Reports whether s is a 40-character hexadecimal string. */
export function isSHA(s: string): boolean {
  if (s.length !== 40) return false;
  for (let i = 0; i < 40; i++) {
    const c = s.charCodeAt(i);
    // 0-9: 48-57, a-f: 97-102
    if ((c >= 48 && c <= 57) || (c >= 97 && c <= 102)) continue;
    return false;
  }
  return true;
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

/**
 * Parses a `uses:` line and returns [action, ref, tag] or null.
 *
 * Expects the content after the diff prefix (- or +), e.g.:
 *   "      - uses: actions/checkout@abc123 # v4.1.1"
 *
 * Action target is owner/repo or owner/repo/path.
 * Ref is everything between @ and whitespace.
 * Tag is the first non-whitespace token after "# " (optional).
 */
function parseUses(s: string): [string, string, string] | null {
  const idx = s.indexOf("uses:");
  if (idx < 0) return null;

  // Skip "uses:" and whitespace.
  let i = idx + 5;
  while (i < s.length && s[i] === " ") i++;
  if (i >= s.length) return null;

  // Read action target (up to @).
  const atIdx = s.indexOf("@", i);
  if (atIdx < 0) return null;
  const action = s.substring(i, atIdx);

  // Action must contain at least one slash (owner/repo).
  if (action.indexOf("/") < 0) return null;

  // Read ref (non-whitespace after @).
  let j = atIdx + 1;
  while (j < s.length && s[j] !== " " && s[j] !== "\t") j++;
  if (j === atIdx + 1) return null;
  const ref = s.substring(atIdx + 1, j);

  // Look for optional tag comment: skip whitespace, expect "# ", then read token.
  let tag = "";
  while (j < s.length && (s[j] === " " || s[j] === "\t")) j++;
  if (j < s.length && s[j] === "#") {
    j++;
    while (j < s.length && (s[j] === " " || s[j] === "\t")) j++;
    const tagStart = j;
    while (j < s.length && s[j] !== " " && s[j] !== "\t") j++;
    if (j > tagStart) {
      tag = s.substring(tagStart, j);
    }
  }

  return [action, ref, tag];
}

function parsePatch(file: string, patch: string): ActionUpdate[] {
  const removed = new Map<string, Ref[]>();
  const added = new Map<string, Ref[]>();

  for (const line of patch.split("\n")) {
    if (line.length === 0) continue;

    const prefix = line[0];
    if (prefix !== "-" && prefix !== "+") continue;

    const parsed = parseUses(line.substring(1));
    if (!parsed) continue;

    const [action, raw, tag] = parsed;
    const r: Ref = { raw, tag };
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
