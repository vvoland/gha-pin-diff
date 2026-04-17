import { isSHA, type ActionUpdate } from "../diffparser/parser.js";
import { APIError, type Client } from "../github/client.js";
import { updateOwnerRepo } from "../compare/compare.js";

/** Reports a tag comment that doesn't match the pinned SHA. */
export interface Mismatch {
  update: ActionUpdate;
  tag: string; // the tag from the comment (e.g. "v6.2.0")
  expectSHA: string; // SHA the tag actually resolves to, empty if tag not found
}

/** Sentinel stored in the resolved map when the tag does not exist. */
const TAG_NOT_FOUND = "!not-found";

/**
 * Verifies that new SHA pins match their inline tag comments.
 * Only checks updates where newRef is a SHA and newTag is present.
 */
export async function check(
  client: Client,
  updates: ActionUpdate[]
): Promise<Mismatch[]> {
  interface Job {
    idx: number;
    update: ActionUpdate;
  }

  const jobs: Job[] = [];
  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    if (!isSHA(u.newRef) || !u.newTag) continue;
    if (isSHA(u.newTag)) continue;
    jobs.push({ idx: i, update: u });
  }

  if (jobs.length === 0) return [];

  // Deduplicate by action+tag to avoid redundant API calls.
  const resolved = new Map<string, string>();
  const seen = new Set<string>();
  const promises: Promise<void>[] = [];

  for (const j of jobs) {
    const k = `${j.update.action}\0${j.update.newTag}`;
    if (seen.has(k)) continue;
    seen.add(k);

    promises.push(
      (async () => {
        const parsed = updateOwnerRepo(j.update);
        if (!parsed) return;
        const [owner, repo] = parsed;
        try {
          const sha = await client.resolveRefSHA(owner, repo, j.update.newTag);
          resolved.set(k, sha);
        } catch (err) {
          if (err instanceof APIError && (err.statusCode === 404 || err.statusCode === 422)) {
            resolved.set(k, TAG_NOT_FOUND);
          }
          console.warn(
            `warning: could not resolve tag ${j.update.newTag} for ${j.update.action}: ${err}`
          );
        }
      })()
    );
  }

  await Promise.all(promises);

  const mismatches: Mismatch[] = [];
  for (const j of jobs) {
    const k = `${j.update.action}\0${j.update.newTag}`;
    const sha = resolved.get(k);
    if (sha === undefined) continue;
    if (sha === TAG_NOT_FOUND) {
      mismatches.push({
        update: j.update,
        tag: j.update.newTag,
        expectSHA: "",
      });
    } else if (sha !== j.update.newRef) {
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
export function formatMismatch(m: Mismatch): string {
  if (!m.expectSHA) {
    return `${m.update.action}: tag ${m.tag} does not exist, but pinned to ${m.update.newRef.substring(0, 7)}`;
  }
  return `${m.update.action}: tag ${m.tag} resolves to ${m.expectSHA.substring(0, 7)}, but pinned to ${m.update.newRef.substring(0, 7)}`;
}
