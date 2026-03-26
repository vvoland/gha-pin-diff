import type { Client } from "../github/client.js";
/**
 * Creates, updates, or deletes the bot comment on a PR.
 * If body is empty, any existing bot comment is deleted.
 * If body is non-empty, the comment is created or updated.
 */
export declare function ensure(client: Client, owner: string, repo: string, pr: number, body: string): Promise<void>;
