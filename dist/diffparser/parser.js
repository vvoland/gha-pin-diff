const shaRe = /^[0-9a-f]{40}$/;
/** Reports whether s is a 40-character hexadecimal string. */
export function isSHA(s) {
    return shaRe.test(s);
}
function bestTag(r) {
    if (r.tag)
        return r.tag;
    if (!isSHA(r.raw))
        return r.raw;
    return "";
}
/**
 * Scans unified diff patches from changed workflow files and returns
 * all detected version changes. Each entry in patches maps a file path to
 * the unified diff patch text (as returned by the GitHub PR files API).
 */
export function parse(patches) {
    const updates = [];
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
function parsePatch(file, patch) {
    const removed = new Map();
    const added = new Map();
    for (const line of patch.split("\n")) {
        if (line.length === 0)
            continue;
        const prefix = line[0];
        if (prefix !== "-" && prefix !== "+")
            continue;
        const parsed = parseUses(line.substring(1));
        if (!parsed)
            continue;
        const [action, raw, tag] = parsed;
        const r = { raw, tag };
        const target = prefix === "-" ? removed : added;
        const existing = target.get(action) || [];
        existing.push(r);
        target.set(action, existing);
    }
    const updates = [];
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
//# sourceMappingURL=parser.js.map