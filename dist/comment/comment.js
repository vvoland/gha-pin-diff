import { APIError } from "../github/client.js";
import { MARKER } from "../render/render.js";
/**
 * Creates, updates, or deletes the bot comment on a PR.
 * If body is empty, any existing bot comment is deleted.
 * If body is non-empty, the comment is created or updated.
 */
export async function ensure(client, owner, repo, pr, body) {
    const existing = await findBotComment(client, owner, repo, pr);
    if (!body) {
        if (existing) {
            await client.deleteIssueComment(owner, repo, existing.id);
        }
        return;
    }
    if (existing) {
        await client.updateIssueComment(owner, repo, existing.id, body);
    }
    else {
        await client.createIssueComment(owner, repo, pr, body);
    }
}
/**
 * Creates, updates, or deletes the bot comment when the token is allowed to.
 * Forked pull_request runs can have read-only tokens even when the workflow asks
 * for write permissions, so comment permission failures are logged as warnings.
 */
export async function ensureIfAllowed(client, owner, repo, pr, body) {
    try {
        await ensure(client, owner, repo, pr, body);
    }
    catch (err) {
        if (isCommentPermissionError(err)) {
            console.log(`::warning::${formatCommentPermissionError(err)}`);
            return;
        }
        throw err;
    }
}
export function isCommentPermissionError(err) {
    return (err instanceof APIError &&
        err.statusCode === 403 &&
        /\/issues(?:\/\d+\/comments|\/comments\/\d+)(?:\?|$)/.test(err.url) &&
        err.body.includes("Resource not accessible by integration"));
}
function formatCommentPermissionError(err) {
    return [
        "unable to post PR comment with the current token",
        "GitHub returned 403 Resource not accessible by integration",
        "this commonly happens on pull requests from forks or Dependabot runs without comment permissions",
        "grant pull-requests: write or run in a context with a writable token",
    ].join("; ");
}
async function findBotComment(client, owner, repo, pr) {
    const comments = await client.listIssueComments(owner, repo, pr);
    for (const c of comments) {
        if (c.body.includes(MARKER)) {
            return { id: c.id };
        }
    }
    return null;
}
//# sourceMappingURL=comment.js.map