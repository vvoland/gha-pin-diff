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

/** Returns the first whitespace-delimited token, or "" if empty. */
function firstToken(s: string): string {
  const t = s.trimStart();
  const sp = t.indexOf(" ");
  if (sp < 0) return t;
  return t.substring(0, sp);
}

/**
 * Parses a `uses:` line and returns [action, ref, tag] or null.
 *
 * Format: uses: owner/repo@ref  OR  uses: owner/repo@ref # tag
 */
function parseUses(s: string): [string, string, string] | null {
  const usesIdx = s.indexOf("uses:");
  if (usesIdx < 0) return null;
  const afterUses = s.substring(usesIdx + 5).trimStart();

  // Split "owner/repo@ref # tag" at @.
  const atIdx = afterUses.indexOf("@");
  if (atIdx < 0) return null;
  const action = afterUses.substring(0, atIdx);
  if (action.indexOf("/") < 0) return null;

  // Everything after @ may be "ref" or "ref # tag".
  const afterAt = afterUses.substring(atIdx + 1);
  const hashIdx = afterAt.indexOf("#");

  const ref = hashIdx < 0
    ? afterAt.trim()
    : afterAt.substring(0, hashIdx).trim();
  if (!ref) return null;

  const tag = hashIdx < 0 ? "" : firstToken(afterAt.substring(hashIdx + 1));

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
