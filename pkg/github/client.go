// Package github provides a thin REST API client for the GitHub endpoints
// needed by gha-pin-diff.
package github

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// Client is a minimal GitHub REST API client.
type Client struct {
	httpClient *http.Client
	token      string
	baseURL    string // e.g. "https://api.github.com"
}

// NewClient creates a new GitHub API client.
func NewClient(token string) *Client {
	return &Client{
		httpClient: http.DefaultClient,
		token:      token,
		baseURL:    "https://api.github.com",
	}
}

// SetBaseURL overrides the API base URL (useful for testing).
func (c *Client) SetBaseURL(url string) {
	c.baseURL = strings.TrimRight(url, "/")
}

// PullRequestFile represents a file changed in a pull request.
type PullRequestFile struct {
	Filename string `json:"filename"`
	Patch    string `json:"patch"`
}

// CompareResult represents the result of comparing two commits.
type CompareResult struct {
	HTMLURL      string        `json:"html_url"`
	TotalCommits int           `json:"total_commits"`
	Commits      []CommitEntry `json:"commits"`
}

// CommitEntry represents a single commit in a comparison.
type CommitEntry struct {
	SHA    string       `json:"sha"`
	Commit CommitDetail `json:"commit"`
	Author *User        `json:"author"`
}

// CommitDetail holds the commit metadata.
type CommitDetail struct {
	Message string     `json:"message"`
	Author  CommitUser `json:"author"`
}

// CommitUser is the author/committer info inside a commit object.
type CommitUser struct {
	Name string `json:"name"`
	Date string `json:"date"`
}

// User is a GitHub user (may be nil for ghost accounts).
type User struct {
	Login string `json:"login"`
}

// IssueComment represents a comment on an issue or pull request.
type IssueComment struct {
	ID   int64  `json:"id"`
	Body string `json:"body"`
	User *User  `json:"user"`
}

// ListPRFiles returns all files changed in a pull request (handles pagination).
func (c *Client) ListPRFiles(ctx context.Context, owner, repo string, pr int) ([]PullRequestFile, error) {
	var all []PullRequestFile
	page := 1
	for {
		url := fmt.Sprintf("%s/repos/%s/%s/pulls/%d/files?per_page=100&page=%d",
			c.baseURL, owner, repo, pr, page)
		var files []PullRequestFile
		if err := c.get(ctx, url, &files); err != nil {
			return nil, fmt.Errorf("list PR files page %d: %w", page, err)
		}
		all = append(all, files...)
		if len(files) < 100 {
			break
		}
		page++
	}
	return all, nil
}

// CompareCommits compares two commits in a repository.
func (c *Client) CompareCommits(ctx context.Context, owner, repo, base, head string) (*CompareResult, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/compare/%s...%s?per_page=100",
		c.baseURL, owner, repo, base, head)
	var result CompareResult
	if err := c.get(ctx, url, &result); err != nil {
		return nil, fmt.Errorf("compare %s...%s: %w", base[:7], head[:7], err)
	}
	return &result, nil
}

// ListIssueComments lists all comments on an issue or pull request (handles pagination).
func (c *Client) ListIssueComments(ctx context.Context, owner, repo string, issueNum int) ([]IssueComment, error) {
	var all []IssueComment
	page := 1
	for {
		url := fmt.Sprintf("%s/repos/%s/%s/issues/%d/comments?per_page=100&page=%d",
			c.baseURL, owner, repo, issueNum, page)
		var comments []IssueComment
		if err := c.get(ctx, url, &comments); err != nil {
			return nil, fmt.Errorf("list comments page %d: %w", page, err)
		}
		all = append(all, comments...)
		if len(comments) < 100 {
			break
		}
		page++
	}
	return all, nil
}

// CreateIssueComment creates a new comment on an issue or pull request.
func (c *Client) CreateIssueComment(ctx context.Context, owner, repo string, issueNum int, body string) error {
	url := fmt.Sprintf("%s/repos/%s/%s/issues/%d/comments",
		c.baseURL, owner, repo, issueNum)
	payload := fmt.Sprintf(`{"body":%s}`, jsonString(body))
	return c.post(ctx, url, payload)
}

// UpdateIssueComment updates an existing issue comment.
func (c *Client) UpdateIssueComment(ctx context.Context, owner, repo string, commentID int64, body string) error {
	url := fmt.Sprintf("%s/repos/%s/%s/issues/comments/%d",
		c.baseURL, owner, repo, commentID)
	payload := fmt.Sprintf(`{"body":%s}`, jsonString(body))
	return c.patch(ctx, url, payload)
}

// DeleteIssueComment deletes an issue comment.
func (c *Client) DeleteIssueComment(ctx context.Context, owner, repo string, commentID int64) error {
	url := fmt.Sprintf("%s/repos/%s/%s/issues/comments/%d",
		c.baseURL, owner, repo, commentID)
	return c.delete(ctx, url)
}

func (c *Client) get(ctx context.Context, url string, target interface{}) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("GET %s: status %d: %s", url, resp.StatusCode, body)
	}
	return json.NewDecoder(resp.Body).Decode(target)
}

func (c *Client) post(ctx context.Context, url, payload string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(payload))
	if err != nil {
		return err
	}
	c.setHeaders(req)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("POST %s: status %d: %s", url, resp.StatusCode, body)
	}
	return nil
}

func (c *Client) patch(ctx context.Context, url, payload string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, url, strings.NewReader(payload))
	if err != nil {
		return err
	}
	c.setHeaders(req)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("PATCH %s: status %d: %s", url, resp.StatusCode, body)
	}
	return nil
}

func (c *Client) delete(ctx context.Context, url string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return err
	}
	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("DELETE %s: status %d: %s", url, resp.StatusCode, body)
	}
	return nil
}

func (c *Client) setHeaders(req *http.Request) {
	req.Header.Set("Accept", "application/vnd.github+json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
}

func jsonString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}
