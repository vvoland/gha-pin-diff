import type { ActionUpdate } from "../diffparser/parser.js";
import { type Client } from "../github/client.js";
/** Holds the comparison data for a single action update. */
export interface Result {
    update: ActionUpdate;
    compareURL: string;
    totalCommits: number;
    commits: CommitInfo[];
    err: Error | null;
}
/** Simplified commit summary. */
export interface CommitInfo {
    sha: string;
    message: string;
    author: string;
    date: Date | null;
}
/** Fetches comparison data for each action update concurrently. */
export declare function fetch(client: Client, updates: ActionUpdate[]): Promise<Result[]>;
/**
 * Extracts owner and repo from an action target.
 * "actions/checkout" -> ["actions", "checkout"]
 * "org/repo/.github/workflows/x.yml" -> ["org", "repo"]
 */
export declare function actionOwnerRepo(action: string): [string, string] | null;
export declare function updateOwnerRepo(update: Pick<ActionUpdate, "action" | "repo">): [string, string] | null;
