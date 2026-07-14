const MAX_CONCURRENT_REQUESTS = 5;
/**
 * Verifies that each digest-pinned Compose image still resolves its tag to the
 * pinned digest. A tag is mutable, so `image: nginx:1.27@sha256:...` is only
 * trustworthy if the registry agrees the tag points at that digest; a
 * disagreement means the tag was moved (or the pin was hand-edited) and the
 * digest no longer corresponds to the human-readable version under review.
 *
 * Only updates carrying both a tag and a new digest are checked; action SHA
 * pins (which never set a digest) are handled by [check] in pinverify.
 */
export async function check(client, updates) {
    const jobs = [];
    for (const u of updates) {
        if (!u.newDigest || !u.newTag)
            continue;
        jobs.push({ update: u, key: `${u.action}\0${u.newTag}` });
    }
    if (jobs.length === 0)
        return [];
    // Deduplicate by image+tag to avoid redundant registry calls.
    const resolved = new Map();
    const seen = new Set();
    const unique = [];
    for (const j of jobs) {
        if (seen.has(j.key))
            continue;
        seen.add(j.key);
        unique.push(j);
    }
    let next = 0;
    async function worker() {
        for (;;) {
            const j = unique[next++];
            if (!j)
                return;
            try {
                const digest = await client.resolveDigest(j.update.action, j.update.newTag);
                resolved.set(j.key, digest);
            }
            catch (err) {
                console.warn(`warning: could not resolve tag ${j.update.newTag} for ${j.update.action}: ${err}`);
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_REQUESTS, unique.length) }, () => worker()));
    const mismatches = [];
    for (const j of jobs) {
        const digest = resolved.get(j.key);
        if (!digest)
            continue;
        if (digest !== j.update.newDigest) {
            mismatches.push({
                update: j.update,
                tag: j.update.newTag,
                expectDigest: digest,
            });
        }
    }
    return mismatches;
}
/** Returns a human-readable description of a digest mismatch. */
export function formatDigestMismatch(m) {
    return `${m.update.action}: tag ${m.tag} resolves to ${shortDigest(m.expectDigest)}, but pinned to ${shortDigest(m.update.newDigest ?? "")}`;
}
function shortDigest(digest) {
    const colon = digest.indexOf(":");
    if (colon < 0)
        return digest.substring(0, 12);
    return `${digest.substring(0, colon)}:${digest.substring(colon + 1, colon + 13)}`;
}
//# sourceMappingURL=verify.js.map