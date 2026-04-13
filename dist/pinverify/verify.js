import { isSHA } from "../diffparser/parser.js";
import { updateOwnerRepo } from "../compare/compare.js";
/**
 * Verifies that new SHA pins match their inline tag comments.
 * Only checks updates where newRef is a SHA and newTag is present.
 */
export async function check(client, updates) {
    const jobs = [];
    for (let i = 0; i < updates.length; i++) {
        const u = updates[i];
        if (!isSHA(u.newRef) || !u.newTag)
            continue;
        if (isSHA(u.newTag))
            continue;
        jobs.push({ idx: i, update: u });
    }
    if (jobs.length === 0)
        return [];
    // Deduplicate by action+tag to avoid redundant API calls.
    const resolved = new Map();
    const seen = new Set();
    const promises = [];
    for (const j of jobs) {
        const k = `${j.update.action}\0${j.update.newTag}`;
        if (seen.has(k))
            continue;
        seen.add(k);
        promises.push((async () => {
            const parsed = updateOwnerRepo(j.update);
            if (!parsed)
                return;
            const [owner, repo] = parsed;
            try {
                const sha = await client.resolveRefSHA(owner, repo, j.update.newTag);
                resolved.set(k, sha);
            }
            catch (err) {
                console.warn(`warning: could not resolve tag ${j.update.newTag} for ${j.update.action}: ${err}`);
            }
        })());
    }
    await Promise.all(promises);
    const mismatches = [];
    for (const j of jobs) {
        const k = `${j.update.action}\0${j.update.newTag}`;
        const sha = resolved.get(k);
        if (!sha)
            continue;
        if (sha !== j.update.newRef) {
            mismatches.push({
                update: j.update,
                tag: j.update.newTag,
                expectSHA: sha,
            });
        }
    }
    return mismatches;
}
/** Returns a human-readable description of a mismatch. */
export function formatMismatch(m) {
    return `${m.update.action}: tag ${m.tag} resolves to ${m.expectSHA.substring(0, 7)}, but pinned to ${m.update.newRef.substring(0, 7)}`;
}
//# sourceMappingURL=verify.js.map