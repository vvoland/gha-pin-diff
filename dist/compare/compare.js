import { APIError } from "../github/client.js";
/** Fetches comparison data for each action update concurrently. */
export async function fetch(client, updates) {
    return Promise.all(updates.map((u) => fetchOne(client, u)));
}
async function fetchOne(client, u) {
    const parsed = actionOwnerRepo(u.action);
    if (!parsed) {
        return {
            update: u,
            compareURL: "",
            totalCommits: 0,
            commits: [],
            err: new Error(`cannot parse owner/repo from "${u.action}"`),
        };
    }
    const [owner, repo] = parsed;
    try {
        const cmp = await client.compareCommits(owner, repo, u.oldRef, u.newRef);
        const commits = cmp.commits.map((c) => {
            let author = c.commit.author.name;
            if (c.author?.login) {
                author = c.author.login;
            }
            let date = null;
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
    }
    catch (err) {
        if (err instanceof APIError) {
            console.warn(`warning: compare failed for ${u.action} (${shortRef(u.oldRef)}...${shortRef(u.newRef)}): HTTP ${err.statusCode}`);
        }
        else {
            console.warn(`warning: compare failed for ${u.action} (${shortRef(u.oldRef)}...${shortRef(u.newRef)}): ${err}`);
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
export function actionOwnerRepo(action) {
    const idx = action.indexOf("/");
    if (idx < 0)
        return null;
    const owner = action.substring(0, idx);
    const rest = action.substring(idx + 1);
    const slashIdx = rest.indexOf("/");
    const repo = slashIdx >= 0 ? rest.substring(0, slashIdx) : rest;
    return [owner, repo];
}
function firstLine(s) {
    const idx = s.indexOf("\n");
    return idx >= 0 ? s.substring(0, idx) : s;
}
function shortRef(ref) {
    return ref.length > 7 ? ref.substring(0, 7) : ref;
}
//# sourceMappingURL=compare.js.map