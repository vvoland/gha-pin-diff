/** Represents a non-OK HTTP response from the GitHub API. */
export class APIError extends Error {
    method;
    url;
    statusCode;
    body;
    constructor(method, url, statusCode, body) {
        super(`${method} ${url}: status ${statusCode}: ${body}`);
        this.name = "APIError";
        this.method = method;
        this.url = url;
        this.statusCode = statusCode;
        this.body = body;
    }
}
/** Minimal GitHub REST API client. */
export class Client {
    token;
    baseURL;
    constructor(token) {
        this.token = token;
        this.baseURL = "https://api.github.com";
    }
    /** Overrides the API base URL (useful for testing). */
    setBaseURL(url) {
        this.baseURL = url.replace(/\/+$/, "");
    }
    /** Returns all files changed in a pull request (handles pagination). */
    async listPRFiles(owner, repo, pr) {
        const all = [];
        let page = 1;
        for (;;) {
            const url = `${this.baseURL}/repos/${owner}/${repo}/pulls/${pr}/files?per_page=100&page=${page}`;
            const files = await this.get(url);
            all.push(...files);
            if (files.length < 100)
                break;
            page++;
        }
        return all;
    }
    /** Compares two commits in a repository. */
    async compareCommits(owner, repo, base, head) {
        const url = `${this.baseURL}/repos/${owner}/${repo}/compare/${base}...${head}?per_page=100`;
        return this.get(url);
    }
    /** Lists all comments on an issue or pull request (handles pagination). */
    async listIssueComments(owner, repo, issueNum) {
        const all = [];
        let page = 1;
        for (;;) {
            const url = `${this.baseURL}/repos/${owner}/${repo}/issues/${issueNum}/comments?per_page=100&page=${page}`;
            const comments = await this.get(url);
            all.push(...comments);
            if (comments.length < 100)
                break;
            page++;
        }
        return all;
    }
    /** Creates a new comment on an issue or pull request. */
    async createIssueComment(owner, repo, issueNum, body) {
        const url = `${this.baseURL}/repos/${owner}/${repo}/issues/${issueNum}/comments`;
        await this.do("POST", url, JSON.stringify({ body }), 201);
    }
    /** Updates an existing issue comment. */
    async updateIssueComment(owner, repo, commentID, body) {
        const url = `${this.baseURL}/repos/${owner}/${repo}/issues/comments/${commentID}`;
        await this.do("PATCH", url, JSON.stringify({ body }), 200);
    }
    /** Deletes an issue comment. */
    async deleteIssueComment(owner, repo, commentID) {
        const url = `${this.baseURL}/repos/${owner}/${repo}/issues/comments/${commentID}`;
        await this.do("DELETE", url, null, 204);
    }
    /** Resolves a git ref (tag, branch, or SHA) to the commit SHA it points to. */
    async resolveRefSHA(owner, repo, ref) {
        const url = `${this.baseURL}/repos/${owner}/${repo}/commits/${ref}`;
        const result = await this.get(url);
        return result.sha;
    }
    async get(url) {
        const resp = await fetch(url, {
            method: "GET",
            headers: this.headers(),
        });
        if (resp.status !== 200) {
            const body = await resp.text();
            throw new APIError("GET", url, resp.status, body);
        }
        return (await resp.json());
    }
    async do(method, url, payload, expectStatus) {
        const headers = this.headers();
        if (payload) {
            headers["Content-Type"] = "application/json";
        }
        const resp = await fetch(url, {
            method,
            headers,
            body: payload ?? undefined,
        });
        if (resp.status !== expectStatus) {
            const body = await resp.text();
            throw new APIError(method, url, resp.status, body);
        }
    }
    headers() {
        const h = {
            Accept: "application/vnd.github+json",
        };
        if (this.token) {
            h["Authorization"] = `Bearer ${this.token}`;
        }
        return h;
    }
}
//# sourceMappingURL=client.js.map