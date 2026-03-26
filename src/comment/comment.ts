import type { Client } from "../github/client.js";
import { MARKER } from "../render/render.js";

/**
 * Creates, updates, or deletes the bot comment on a PR.
 * If body is empty, any existing bot comment is deleted.
 * If body is non-empty, the comment is created or updated.
 */
export async function ensure(
  client: Client,
  owner: string,
  repo: string,
  pr: number,
  body: string
): Promise<void> {
  const existing = await findBotComment(client, owner, repo, pr);

  if (!body) {
    if (existing) {
      await client.deleteIssueComment(owner, repo, existing.id);
    }
    return;
  }

  if (existing) {
    await client.updateIssueComment(owner, repo, existing.id, body);
  } else {
    await client.createIssueComment(owner, repo, pr, body);
  }
}

async function findBotComment(
  client: Client,
  owner: string,
  repo: string,
  pr: number
): Promise<{ id: number } | null> {
  const comments = await client.listIssueComments(owner, repo, pr);
  for (const c of comments) {
    if (c.body.includes(MARKER)) {
      return { id: c.id };
    }
  }
  return null;
}
