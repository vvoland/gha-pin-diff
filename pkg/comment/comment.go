// Package comment manages creating, updating, and deleting the bot's PR comment.
package comment

import (
	"context"
	"strings"

	"github.com/pawel/gha-pin-diff/pkg/github"
	"github.com/pawel/gha-pin-diff/pkg/render"
)

// Ensure creates, updates, or deletes the bot comment on a PR.
// If body is empty, any existing bot comment is deleted.
// If body is non-empty, the comment is created or updated.
func Ensure(ctx context.Context, client *github.Client, owner, repo string, pr int, body string) error {
	existing, err := findBotComment(ctx, client, owner, repo, pr)
	if err != nil {
		return err
	}

	if body == "" {
		if existing != nil {
			return client.DeleteIssueComment(ctx, owner, repo, existing.ID)
		}
		return nil
	}

	if existing != nil {
		return client.UpdateIssueComment(ctx, owner, repo, existing.ID, body)
	}
	return client.CreateIssueComment(ctx, owner, repo, pr, body)
}

func findBotComment(ctx context.Context, client *github.Client, owner, repo string, pr int) (*github.IssueComment, error) {
	comments, err := client.ListIssueComments(ctx, owner, repo, pr)
	if err != nil {
		return nil, err
	}
	for i := range comments {
		if strings.Contains(comments[i].Body, render.Marker) {
			return &comments[i], nil
		}
	}
	return nil, nil
}
