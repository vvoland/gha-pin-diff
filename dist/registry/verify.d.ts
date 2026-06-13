import type { ActionUpdate } from "../diffparser/parser.js";
import type { RegistryClient } from "./client.js";
/** Reports a Compose image tag whose pinned digest doesn't match the registry. */
export interface DigestMismatch {
    update: ActionUpdate;
    tag: string;
    expectDigest: string;
}
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
export declare function check(client: RegistryClient, updates: ActionUpdate[]): Promise<DigestMismatch[]>;
/** Returns a human-readable description of a digest mismatch. */
export declare function formatDigestMismatch(m: DigestMismatch): string;
