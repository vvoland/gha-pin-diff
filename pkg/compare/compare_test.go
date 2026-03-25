package compare

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pawel/gha-pin-diff/pkg/diffparser"
	"github.com/pawel/gha-pin-diff/pkg/github"
)

func TestFetch(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/actions/checkout/compare/", func(w http.ResponseWriter, r *http.Request) {
		resp := `{
			"html_url": "https://github.com/actions/checkout/compare/aaa...bbb",
			"total_commits": 2,
			"commits": [
				{
					"sha": "abc1234567890abc1234567890abc1234567890ab",
					"commit": {
						"message": "Fix something\n\nDetails here",
						"author": {"name": "Alice", "date": "2024-04-15T10:00:00Z"}
					},
					"author": {"login": "alice"}
				},
				{
					"sha": "def1234567890def1234567890def1234567890de",
					"commit": {
						"message": "Update deps",
						"author": {"name": "Bob", "date": "2024-04-14T09:00:00Z"}
					},
					"author": {"login": "bob"}
				}
			]
		}`
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(resp))
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := github.NewClient("")
	client.SetBaseURL(srv.URL)

	updates := []diffparser.ActionUpdate{
		{
			Action: "actions/checkout",
			OldRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			NewRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			OldTag: "v4.0.0",
			NewTag: "v4.1.0",
			File:   ".github/workflows/ci.yml",
		},
	}

	results := Fetch(t.Context(), client, updates)
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	r := results[0]
	if r.Err != nil {
		t.Fatalf("unexpected error: %v", r.Err)
	}
	if r.TotalCommits != 2 {
		t.Errorf("TotalCommits = %d, want 2", r.TotalCommits)
	}
	if r.CompareURL != "https://github.com/actions/checkout/compare/aaa...bbb" {
		t.Errorf("CompareURL = %q", r.CompareURL)
	}
	if len(r.Commits) != 2 {
		t.Fatalf("len(Commits) = %d, want 2", len(r.Commits))
	}
	if r.Commits[0].Message != "Fix something" {
		t.Errorf("Commits[0].Message = %q, want first line only", r.Commits[0].Message)
	}
	if r.Commits[0].Author != "alice" {
		t.Errorf("Commits[0].Author = %q, want alice", r.Commits[0].Author)
	}
}

func TestFetchAPIError(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"message":"Not Found"}`))
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := github.NewClient("")
	client.SetBaseURL(srv.URL)

	updates := []diffparser.ActionUpdate{
		{
			Action: "actions/deleted-action",
			OldRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			NewRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			File:   ".github/workflows/ci.yml",
		},
	}

	results := Fetch(t.Context(), client, updates)
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].Err == nil {
		t.Fatal("expected error for 404 response")
	}

	// Verify errors.AsType (Go 1.26) works with our typed APIError.
	apiErr, ok := errors.AsType[*github.APIError](results[0].Err)
	if !ok {
		t.Fatalf("expected *github.APIError, got %T", results[0].Err)
	}
	if apiErr.StatusCode != http.StatusNotFound {
		t.Errorf("StatusCode = %d, want 404", apiErr.StatusCode)
	}
}

func TestActionOwnerRepo(t *testing.T) {
	tests := []struct {
		action    string
		wantOwner string
		wantRepo  string
		wantOK    bool
	}{
		{"actions/checkout", "actions", "checkout", true},
		{"org/repo/.github/workflows/deploy.yml", "org", "repo", true},
		{"invalid", "", "", false},
	}
	for _, tt := range tests {
		owner, repo, ok := actionOwnerRepo(tt.action)
		if owner != tt.wantOwner || repo != tt.wantRepo || ok != tt.wantOK {
			t.Errorf("actionOwnerRepo(%q) = (%q, %q, %v), want (%q, %q, %v)",
				tt.action, owner, repo, ok, tt.wantOwner, tt.wantRepo, tt.wantOK)
		}
	}
}
