import { APIError, type Client } from "../github/client.js";
/**
 * Creates, updates, or deletes the bot comment on a PR.
 * If body is empty, any existing bot comment is deleted.
 * If body is non-empty, the comment is created or updated.
 */
export declare function ensure(client: Client, owner: string, repo: string, pr: number, body: string): Promise<void>;
/**
 * Creates, updates, or deletes the bot comment when the token is allowed to.
 * Forked pull_request runs can have read-only tokens even when the workflow asks
 * for write permissions, so comment permission failures are logged as warnings.
 */
export declare function ensureIfAllowed(client: Client, owner: string, repo: string, pr: number, body: string): Promise<void>;
export declare function isCommentPermissionError(err: unknown): err is APIError;
