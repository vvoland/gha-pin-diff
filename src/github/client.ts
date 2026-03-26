/** Represents a non-OK HTTP response from the GitHub API. */
export class APIError extends Error {
  method: string;
  url: string;
  statusCode: number;
  body: string;

  constructor(method: string, url: string, statusCode: number, body: string) {
    super(`${method} ${url}: status ${statusCode}: ${body}`);
    this.name = "APIError";
    this.method = method;
    this.url = url;
    this.statusCode = statusCode;
    this.body = body;
  }
}

/** A file changed in a pull request. */
export interface PullRequestFile {
  filename: string;
  patch: string;
}

/** The result of comparing two commits. */
export interface CompareResult {
  html_url: string;
  total_commits: number;
  commits: CommitEntry[];
}

/** A single commit in a comparison. */
export interface CommitEntry {
  sha: string;
  commit: CommitDetail;
  author: User | null;
}

/** Commit metadata. */
export interface CommitDetail {
  message: string;
  author: CommitUser;
}

/** Author/committer info inside a commit object. */
export interface CommitUser {
  name: string;
  date: string;
}

/** A GitHub user (may be null for ghost accounts). */
export interface User {
  login: string;
}

/** A comment on an issue or pull request. */
export interface IssueComment {
  id: number;
  body: string;
  user: User | null;
}

/** Minimal GitHub REST API client. */
export class Client {
  private token: string;
  private baseURL: string;

  constructor(token: string) {
    this.token = token;
    this.baseURL = "https://api.github.com";
  }

  /** Overrides the API base URL (useful for testing). */
  setBaseURL(url: string): void {
    this.baseURL = url.replace(/\/+$/, "");
  }

  /** Returns all files changed in a pull request (handles pagination). */
  async listPRFiles(
    owner: string,
    repo: string,
    pr: number
  ): Promise<PullRequestFile[]> {
    const all: PullRequestFile[] = [];
    let page = 1;
    for (;;) {
      const url = `${this.baseURL}/repos/${owner}/${repo}/pulls/${pr}/files?per_page=100&page=${page}`;
      const files = await this.get<PullRequestFile[]>(url);
      all.push(...files);
      if (files.length < 100) break;
      page++;
    }
    return all;
  }

  /** Compares two commits in a repository. */
  async compareCommits(
    owner: string,
    repo: string,
    base: string,
    head: string
  ): Promise<CompareResult> {
    const url = `${this.baseURL}/repos/${owner}/${repo}/compare/${base}...${head}?per_page=100`;
    return this.get<CompareResult>(url);
  }

  /** Lists all comments on an issue or pull request (handles pagination). */
  async listIssueComments(
    owner: string,
    repo: string,
    issueNum: number
  ): Promise<IssueComment[]> {
    const all: IssueComment[] = [];
    let page = 1;
    for (;;) {
      const url = `${this.baseURL}/repos/${owner}/${repo}/issues/${issueNum}/comments?per_page=100&page=${page}`;
      const comments = await this.get<IssueComment[]>(url);
      all.push(...comments);
      if (comments.length < 100) break;
      page++;
    }
    return all;
  }

  /** Creates a new comment on an issue or pull request. */
  async createIssueComment(
    owner: string,
    repo: string,
    issueNum: number,
    body: string
  ): Promise<void> {
    const url = `${this.baseURL}/repos/${owner}/${repo}/issues/${issueNum}/comments`;
    await this.do("POST", url, JSON.stringify({ body }), 201);
  }

  /** Updates an existing issue comment. */
  async updateIssueComment(
    owner: string,
    repo: string,
    commentID: number,
    body: string
  ): Promise<void> {
    const url = `${this.baseURL}/repos/${owner}/${repo}/issues/comments/${commentID}`;
    await this.do("PATCH", url, JSON.stringify({ body }), 200);
  }

  /** Deletes an issue comment. */
  async deleteIssueComment(
    owner: string,
    repo: string,
    commentID: number
  ): Promise<void> {
    const url = `${this.baseURL}/repos/${owner}/${repo}/issues/comments/${commentID}`;
    await this.do("DELETE", url, null, 204);
  }

  /** Resolves a git ref (tag, branch, or SHA) to the commit SHA it points to. */
  async resolveRefSHA(
    owner: string,
    repo: string,
    ref: string
  ): Promise<string> {
    const url = `${this.baseURL}/repos/${owner}/${repo}/commits/${ref}`;
    const result = await this.get<{ sha: string }>(url);
    return result.sha;
  }

  private async get<T>(url: string): Promise<T> {
    const resp = await fetch(url, {
      method: "GET",
      headers: this.headers(),
    });

    if (resp.status !== 200) {
      const body = await resp.text();
      throw new APIError("GET", url, resp.status, body);
    }
    return (await resp.json()) as T;
  }

  private async do(
    method: string,
    url: string,
    payload: string | null,
    expectStatus: number
  ): Promise<void> {
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

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: "application/vnd.github+json",
    };
    if (this.token) {
      h["Authorization"] = `Bearer ${this.token}`;
    }
    return h;
  }
}
