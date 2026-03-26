/** Represents a non-OK HTTP response from the GitHub API. */
export declare class APIError extends Error {
    method: string;
    url: string;
    statusCode: number;
    body: string;
    constructor(method: string, url: string, statusCode: number, body: string);
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
export declare class Client {
    private token;
    private baseURL;
    constructor(token: string);
    /** Overrides the API base URL (useful for testing). */
    setBaseURL(url: string): void;
    /** Returns all files changed in a pull request (handles pagination). */
    listPRFiles(owner: string, repo: string, pr: number): Promise<PullRequestFile[]>;
    /** Compares two commits in a repository. */
    compareCommits(owner: string, repo: string, base: string, head: string): Promise<CompareResult>;
    /** Lists all comments on an issue or pull request (handles pagination). */
    listIssueComments(owner: string, repo: string, issueNum: number): Promise<IssueComment[]>;
    /** Creates a new comment on an issue or pull request. */
    createIssueComment(owner: string, repo: string, issueNum: number, body: string): Promise<void>;
    /** Updates an existing issue comment. */
    updateIssueComment(owner: string, repo: string, commentID: number, body: string): Promise<void>;
    /** Deletes an issue comment. */
    deleteIssueComment(owner: string, repo: string, commentID: number): Promise<void>;
    /** Resolves a git ref (tag, branch, or SHA) to the commit SHA it points to. */
    resolveRefSHA(owner: string, repo: string, ref: string): Promise<string>;
    private get;
    private do;
    private headers;
}
