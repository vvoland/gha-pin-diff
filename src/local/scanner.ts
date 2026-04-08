import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** A SHA-pinned action reference found in a workflow file. */
export interface Pin {
  action: string; // e.g. "actions/checkout"
  sha: string; // 40-char hex SHA
  tag: string; // from inline comment (e.g. "v4.1.1")
  file: string; // workflow file path relative to root
  line: number; // 1-based line number
}

const shaRe = /^[0-9a-f]{40}$/;

/**
 * Parses a `uses:` line and returns [action, ref, tag] or null.
 * Replicates the logic from diffparser/parser.ts.
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

  const tag =
    commentParts.length > 0
      ? commentParts.join("#").trimStart().split(/\s/)[0]
      : "";

  return [actionPart, ref, tag];
}

/** Scans a single file's content for SHA-pinned action references. */
export function scanContent(content: string, file: string): Pin[] {
  const pins: Pin[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseUses(lines[i]);
    if (!parsed) continue;
    const [action, ref, tag] = parsed;
    if (!shaRe.test(ref)) continue;
    if (!tag) continue;
    pins.push({ action, sha: ref, tag, file, line: i + 1 });
  }
  return pins;
}

/** Recursively finds all .yml and .yaml files under a directory. */
function findYAMLFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      files.push(...findYAMLFiles(full));
    } else if (entry.endsWith(".yml") || entry.endsWith(".yaml")) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Scans all workflow files under the given directory for SHA-pinned actions
 * with tag comments. Returns all pins found.
 */
export function scan(workflowDir: string, rootDir: string): Pin[] {
  const yamlFiles = findYAMLFiles(workflowDir);
  const pins: Pin[] = [];
  for (const file of yamlFiles) {
    const content = readFileSync(file, "utf-8");
    const rel = relative(rootDir, file);
    pins.push(...scanContent(content, rel));
  }
  return pins;
}
