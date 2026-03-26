import { type ActionUpdate } from "../diffparser/parser.js";
import type { Client } from "../github/client.js";
/** Reports a tag comment that doesn't match the pinned SHA. */
export interface Mismatch {
    update: ActionUpdate;
    tag: string;
    expectSHA: string;
}
/**
 * Verifies that new SHA pins match their inline tag comments.
 * Only checks updates where newRef is a SHA and newTag is present.
 */
export declare function check(client: Client, updates: ActionUpdate[]): Promise<Mismatch[]>;
/** Returns a human-readable description of a mismatch. */
export declare function formatMismatch(m: Mismatch): string;
