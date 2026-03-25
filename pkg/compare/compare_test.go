package compare

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pawel/gha-pin-diff/pkg/diffparser"
	"github.com/pawel/gha-pin-diff/pkg/github"
)

func TestFetch(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/actions/checkout/compare/", func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]interface{}{
			"html_url":      "https://github.com/actions/checkout/compare/aaa...bbb",
			"total_commits": 2,
			"commits": []map[string]interface{}{
				{
					"sha": "abc1234567890abc1234567890abc1234567890ab",
					"commit": map[string]interface{}{
						"message": "Fix something\n\nDetails here",
						"author":  map[string]string{"name": "Alice", "date": "2024-04-15T10:00:00Z"},
					},
					"author": map[string]string{"login": "alice"},
				},
				{
					"sha": "def1234567890def1234567890def1234567890de",
					"commit": map[string]interface{}{
						"message": "Update deps",
						"author":  map[string]string{"name": "Bob", "date": "2024-04-14T09:00:00Z"},
					},
					"author": map[string]string{"login": "bob"},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
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

	results := Fetch(context.Background(), client, updates)
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

	results := Fetch(context.Background(), client, updates)
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].Err == nil {
		t.Fatal("expected error for 404 response")
	}
}

func TestActionOwnerRepo(t *testing.T) {
	tests := []struct {
		action    string
		wantOwner string
		wantRepo  string
	}{
		{"actions/checkout", "actions", "checkout"},
		{"org/repo/.github/workflows/deploy.yml", "org", "repo"},
		{"invalid", "", ""},
	}
	for _, tt := range tests {
		owner, repo := actionOwnerRepo(tt.action)
		if owner != tt.wantOwner || repo != tt.wantRepo {
			t.Errorf("actionOwnerRepo(%q) = (%q, %q), want (%q, %q)",
				tt.action, owner, repo, tt.wantOwner, tt.wantRepo)
		}
	}
}
