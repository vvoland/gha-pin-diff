/** Represents a single action whose version ref changed. */
export interface ActionUpdate {
  action: string; // display name, e.g. "actions/checkout" or "fzf-lua"
  oldRef: string; // git ref: 40-char SHA or tag name
  newRef: string; // git ref: 40-char SHA or tag name
  oldTag: string; // human-readable version (from inline comment or tag ref itself)
  newTag: string; // human-readable version
  file: string; // workflow file path
  repo?: string; // GitHub repository path, e.g. "actions/checkout"
}

const shaRe = /^[0-9a-f]{40}$/;

/** Reports whether s is a 40-character hexadecimal string. */
export function isSHA(s: string): boolean {
  return shaRe.test(s);
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
 * Format: uses: owner/repo@ref  OR  uses: owner/repo@ref # tag
 */
function parseUses(s: string): [string, string, string] | null {
  const usesIdx = s.indexOf("uses:");
  if (usesIdx < 0) return null;
  const afterUses = s.substring(usesIdx + 5).trimStart();

  const [actionPart, ...rest] = afterUses.split("@");
  if (rest.length === 0) return null;
  if (!actionPart.includes("/")) return null;

  const afterAt = rest.join("@");
  const [refPart, ...commentParts] = afterAt.split("#");
  const ref = refPart.trim();
  if (!ref) return null;

  const tag = commentParts.length > 0
    ? commentParts.join("#").trimStart().split(/\s/)[0]
    : "";

  return [actionPart, ref, tag];
}

function parsePatch(file: string, patch: string): ActionUpdate[] {
  if (isLazyLockFile(file)) {
    return parseLazyLockPatch(file, patch);
  }
  return parseUsesPatch(file, patch);
}

function parseUsesPatch(file: string, patch: string): ActionUpdate[] {
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

function parseLazyLockPatch(file: string, patch: string): ActionUpdate[] {
  const removed = new Map<string, Ref[]>();
  const added = new Map<string, Ref[]>();

  for (const line of patch.split("\n")) {
    if (line.length === 0) continue;

    const prefix = line[0];
    if (prefix !== "-" && prefix !== "+") continue;

    const parsed = parseLazyLockLine(line.substring(1));
    if (!parsed) continue;

    const [plugin, commit] = parsed;
    const r: Ref = { raw: commit, tag: "" };
    const target = prefix === "-" ? removed : added;
    const existing = target.get(plugin) || [];
    existing.push(r);
    target.set(plugin, existing);
  }

  const updates: ActionUpdate[] = [];
  for (const [plugin, rems] of removed) {
    const adds = added.get(plugin) || [];
    const n = Math.min(rems.length, adds.length);
    for (let i = 0; i < n; i++) {
      if (rems[i].raw === adds[i].raw) continue;
      updates.push({
        action: plugin,
        oldRef: rems[i].raw,
        newRef: adds[i].raw,
        oldTag: "",
        newTag: "",
        file,
        repo: repoFromLabel(plugin),
      });
    }
    added.delete(plugin);
  }

  return updates;
}

function parseLazyLockLine(s: string): [string, string] | null {
  const m = s.match(/^\s*"([^"]+)"\s*:\s*\{(.*)\}\s*,?\s*$/);
  if (!m) return null;

  const plugin = m[1];
  const body = m[2];
  const commitMatch = body.match(/"commit"\s*:\s*"([0-9a-f]{40})"/);
  if (!commitMatch) return null;

  return [plugin, commitMatch[1]];
}

function isLazyLockFile(file: string): boolean {
  return file === "lazy-lock.json" || file.endsWith("/lazy-lock.json");
}

function repoFromLabel(label: string): string | undefined {
  const parts = label.split("/");
  if (parts.length < 2) return undefined;
  return `${parts[0]}/${parts[1]}`;
}
