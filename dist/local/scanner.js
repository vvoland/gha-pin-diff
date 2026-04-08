import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
const shaRe = /^[0-9a-f]{40}$/;
/**
 * Parses a `uses:` line and returns [action, ref, tag] or null.
 * Replicates the logic from diffparser/parser.ts.
 */
function parseUses(s) {
    const usesIdx = s.indexOf("uses:");
    if (usesIdx < 0)
        return null;
    const afterUses = s.substring(usesIdx + 5).trimStart();
    const [actionPart, ...rest] = afterUses.split("@");
    if (rest.length === 0)
        return null;
    if (!actionPart.includes("/"))
        return null;
    const afterAt = rest.join("@");
    const [refPart, ...commentParts] = afterAt.split("#");
    const ref = refPart.trim();
    if (!ref)
        return null;
    const tag = commentParts.length > 0
        ? commentParts.join("#").trimStart().split(/\s/)[0]
        : "";
    return [actionPart, ref, tag];
}
/** Scans a single file's content for SHA-pinned action references. */
export function scanContent(content, file) {
    const pins = [];
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const parsed = parseUses(lines[i]);
        if (!parsed)
            continue;
        const [action, ref, tag] = parsed;
        if (!shaRe.test(ref))
            continue;
        if (!tag)
            continue;
        pins.push({ action, sha: ref, tag, file, line: i + 1 });
    }
    return pins;
}
/** Recursively finds all .yml and .yaml files under a directory. */
function findYAMLFiles(dir) {
    const files = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            files.push(...findYAMLFiles(full));
        }
        else if (entry.endsWith(".yml") || entry.endsWith(".yaml")) {
            files.push(full);
        }
    }
    return files;
}
/**
 * Scans all workflow files under the given directory for SHA-pinned actions
 * with tag comments. Returns all pins found.
 */
export function scan(workflowDir, rootDir) {
    const yamlFiles = findYAMLFiles(workflowDir);
    const pins = [];
    for (const file of yamlFiles) {
        const content = readFileSync(file, "utf-8");
        const rel = relative(rootDir, file);
        pins.push(...scanContent(content, rel));
    }
    return pins;
}
//# sourceMappingURL=scanner.js.map