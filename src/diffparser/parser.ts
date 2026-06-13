/** Represents a single action whose version ref changed. */
export interface ActionUpdate {
  action: string; // display name, e.g. "actions/checkout" or "fzf-lua"
  oldRef: string; // git ref: 40-char SHA or tag name
  newRef: string; // git ref: 40-char SHA or tag name
  oldTag: string; // human-readable version (from inline comment or tag ref itself)
  newTag: string; // human-readable version
  file: string; // workflow file path
  repo?: string; // GitHub repository path, e.g. "actions/checkout"
  homeURL?: string; // web page for the dependency when it is not a GitHub repo (e.g. a Docker Hub image)
  oldDigest?: string; // image digest pin, e.g. "sha256:...", when the reference is digest-pinned
  newDigest?: string; // image digest pin, e.g. "sha256:..."
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
  if (isComposeFile(file)) {
    return parseComposePatch(file, patch);
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

/**
 * Reports whether file is a Docker Compose file by its name, covering the
 * canonical `compose.yaml`/`docker-compose.yml` names as well as variants such
 * as `docker-compose.prod.yml` and `compose.override.yaml`.
 */
function isComposeFile(file: string): boolean {
  const base = file.substring(file.lastIndexOf("/") + 1);
  return /^(docker-)?compose(\.[^/]+)?\.ya?ml$/.test(base);
}

interface Image {
  name: string; // reference without tag/digest, e.g. "nginx" or "ghcr.io/owner/repo"
  tag: string; // tag after ':', or "" if none
  digest: string; // digest after '@', e.g. "sha256:...", or "" if none
}

/**
 * Parses changed `image:` lines from a Docker Compose patch and returns the
 * detected version changes. Images are paired by name, mirroring how `uses:`
 * refs are paired in [parseUsesPatch]: the tag is the human-readable version
 * and the digest, when present, is the immutable pin (the Docker analog of an
 * action's commit SHA).
 */
function parseComposePatch(file: string, patch: string): ActionUpdate[] {
  const removed = new Map<string, Image[]>();
  const added = new Map<string, Image[]>();

  for (const line of patch.split("\n")) {
    if (line.length === 0) continue;

    const prefix = line[0];
    if (prefix !== "-" && prefix !== "+") continue;

    const img = parseImageLine(line.substring(1));
    if (!img) continue;

    const target = prefix === "-" ? removed : added;
    const existing = target.get(img.name) || [];
    existing.push(img);
    target.set(img.name, existing);
  }

  const updates: ActionUpdate[] = [];
  for (const [name, rems] of removed) {
    const adds = added.get(name) || [];
    const n = Math.min(rems.length, adds.length);
    for (let i = 0; i < n; i++) {
      // Report a re-pin even when the tag is unchanged: moving a tag to a new
      // digest is exactly the opaque, supply-chain-relevant change this tool
      // exists to surface.
      if (rems[i].tag === adds[i].tag && rems[i].digest === adds[i].digest)
        continue;
      const home = imageHome(name);
      updates.push({
        action: name,
        oldRef: rems[i].tag,
        newRef: adds[i].tag,
        oldTag: rems[i].tag,
        newTag: adds[i].tag,
        oldDigest: rems[i].digest,
        newDigest: adds[i].digest,
        file,
        repo: home.repo,
        homeURL: home.homeURL,
      });
    }
    added.delete(name);
  }

  return updates;
}

/** Parses a Compose `image:` line and returns the image reference, or null. */
function parseImageLine(s: string): Image | null {
  const t = s.trimStart();
  if (!t.startsWith("image:")) return null;

  let val = t.substring("image:".length).trim();
  if (!val) return null;

  // Take the first token, dropping any trailing inline comment.
  val = val.split(/\s/)[0];

  // Strip a single layer of surrounding quotes.
  if (
    val.length >= 2 &&
    (val[0] === '"' || val[0] === "'") &&
    val[val.length - 1] === val[0]
  ) {
    val = val.substring(1, val.length - 1);
  }

  return parseImage(val);
}

/**
 * Parses a Docker image reference into its name and tag.
 *
 * Format: [registry[:port]/]repository[:tag][@digest]
 */
function parseImage(ref: string): Image | null {
  if (!ref) return null;

  // Split off the digest, if present: repository:tag@sha256:...
  const at = ref.indexOf("@");
  const digest = at >= 0 ? ref.substring(at + 1) : "";
  const noDigest = at >= 0 ? ref.substring(0, at) : ref;

  // The tag is the part after the last ':' that follows the last '/', so a
  // registry port (registry:5000/repo) is not mistaken for a tag.
  const slash = noDigest.lastIndexOf("/");
  const lastSeg = noDigest.substring(slash + 1);
  const colon = lastSeg.indexOf(":");

  if (colon < 0) {
    return noDigest ? { name: noDigest, tag: "", digest } : null;
  }

  const name = noDigest.substring(0, slash + 1) + lastSeg.substring(0, colon);
  if (!name) return null;
  return { name, tag: lastSeg.substring(colon + 1), digest };
}

interface ImageHome {
  repo?: string; // GitHub owner/repo, for ghcr.io images
  homeURL?: string; // registry web page for the image
}

/**
 * Resolves where an image lives on the web. GitHub Container Registry images
 * are mapped to their backing repository so the normal commit comparison runs;
 * everything else gets a best-effort link to its registry page.
 */
function imageHome(name: string): ImageHome {
  let registry = "docker.io";
  let path = name;

  const slash = name.indexOf("/");
  if (slash >= 0) {
    const head = name.substring(0, slash);
    if (head.includes(".") || head.includes(":") || head === "localhost") {
      registry = head;
      path = name.substring(slash + 1);
    }
  }

  if (registry === "ghcr.io") {
    const repo = repoFromLabel(path);
    if (repo) return { repo, homeURL: `https://github.com/${repo}` };
  }

  if (registry === "docker.io") {
    // Official images live under the implicit library/ namespace and have a
    // distinct Docker Hub URL from namespaced ones.
    const url = path.includes("/")
      ? `https://hub.docker.com/r/${path}`
      : `https://hub.docker.com/_/${path}`;
    return { homeURL: url };
  }

  return { homeURL: `https://${registry}/${path}` };
}
