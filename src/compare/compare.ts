import type { ActionUpdate } from "../diffparser/parser.js";
import { APIError, type Client } from "../github/client.js";

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
  message: string; // first line only
  author: string;
  date: Date | null;
}

/** Fetches comparison data for each action update concurrently. */
export async function fetch(
  client: Client,
  updates: ActionUpdate[]
): Promise<Result[]> {
  return Promise.all(updates.map((u) => fetchOne(client, u)));
}

async function fetchOne(client: Client, u: ActionUpdate): Promise<Result> {
  const parsed = updateOwnerRepo(u);
  if (!parsed) {
    // A dependency that lives outside GitHub (e.g. a Docker Hub image) has no
    // commit comparison to fetch. Report the version change without an error so
    // it renders as a plain bump rather than a failure.
    if (u.homeURL) {
      return { update: u, compareURL: "", totalCommits: 0, commits: [], err: null };
    }
    return {
      update: u,
      compareURL: "",
      totalCommits: 0,
      commits: [],
      err: new Error(`cannot resolve owner/repo for "${u.action}"`),
    };
  }
  const [owner, repo] = parsed;

  try {
    const cmp = await client.compareCommits(owner, repo, u.oldRef, u.newRef);

    const commits: CommitInfo[] = cmp.commits.map((c) => {
      let author = c.commit.author.name;
      if (c.author?.login) {
        author = c.author.login;
      }
      let date: Date | null = null;
      if (c.commit.author.date) {
        date = new Date(c.commit.author.date);
      }
      return {
        sha: c.sha,
        message: firstLine(c.commit.message),
        author,
        date,
      };
    });

    return {
      update: u,
      compareURL: cmp.html_url,
      totalCommits: cmp.total_commits,
      commits,
      err: null,
    };
  } catch (err) {
    if (err instanceof APIError) {
      console.warn(
        `warning: compare failed for ${u.action} (${shortRef(u.oldRef)}...${shortRef(u.newRef)}): HTTP ${err.statusCode}`
      );
    } else {
      console.warn(
        `warning: compare failed for ${u.action} (${shortRef(u.oldRef)}...${shortRef(u.newRef)}): ${err}`
      );
    }
    return {
      update: u,
      compareURL: "",
      totalCommits: 0,
      commits: [],
      err: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * Extracts owner and repo from an action target.
 * "actions/checkout" -> ["actions", "checkout"]
 * "org/repo/.github/workflows/x.yml" -> ["org", "repo"]
 */
export function actionOwnerRepo(
  action: string
): [string, string] | null {
  const parts = action.split("/");
  if (parts.length < 2) return null;
  return [parts[0], parts[1]];
}

export function updateOwnerRepo(
  update: Pick<ActionUpdate, "action" | "repo">
): [string, string] | null {
  return actionOwnerRepo(update.repo || update.action);
}

function firstLine(s: string): string {
  const idx = s.indexOf("\n");
  return idx >= 0 ? s.substring(0, idx) : s;
}

function shortRef(ref: string): string {
  return ref.length > 7 ? ref.substring(0, 7) : ref;
}
