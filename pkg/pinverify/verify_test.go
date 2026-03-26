package pinverify

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/vvoland/gha-pin-diff/pkg/diffparser"
	"github.com/vvoland/gha-pin-diff/pkg/github"
)

const (
	sha40a = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	sha40b = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	sha40c = "cccccccccccccccccccccccccccccccccccccccc"
)

func TestCheckMatch(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/actions/checkout/commits/v6.2.0", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"sha":"` + sha40a + `"}`))
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := github.NewClient("")
	client.SetBaseURL(srv.URL)

	updates := []diffparser.ActionUpdate{
		{
			Action: "actions/checkout",
			OldRef: "v6",
			NewRef: sha40a,
			OldTag: "v6",
			NewTag: "v6.2.0",
			File:   ".github/workflows/ci.yml",
		},
	}

	mismatches := Check(t.Context(), client, updates)
	if len(mismatches) != 0 {
		t.Errorf("expected no mismatches, got %d: %+v", len(mismatches), mismatches)
	}
}

func TestCheckMismatch(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/actions/checkout/commits/v6.2.0", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"sha":"` + sha40b + `"}`))
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := github.NewClient("")
	client.SetBaseURL(srv.URL)

	updates := []diffparser.ActionUpdate{
		{
			Action: "actions/checkout",
			OldRef: "v6",
			NewRef: sha40a, // does not match sha40b
			OldTag: "v6",
			NewTag: "v6.2.0",
			File:   ".github/workflows/ci.yml",
		},
	}

	mismatches := Check(t.Context(), client, updates)
	if len(mismatches) != 1 {
		t.Fatalf("expected 1 mismatch, got %d", len(mismatches))
	}
	m := mismatches[0]
	if m.Tag != "v6.2.0" {
		t.Errorf("Tag = %q, want v6.2.0", m.Tag)
	}
	if m.ExpectSHA != sha40b {
		t.Errorf("ExpectSHA = %q, want %q", m.ExpectSHA, sha40b)
	}
	if m.Update.NewRef != sha40a {
		t.Errorf("Update.NewRef = %q, want %q", m.Update.NewRef, sha40a)
	}
}

func TestCheckSkipsNonSHARef(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	defer srv.Close()

	client := github.NewClient("")
	client.SetBaseURL(srv.URL)

	updates := []diffparser.ActionUpdate{
		{
			Action: "actions/checkout",
			OldRef: "v4.0.0",
			NewRef: "v4.1.0", // not a SHA
			OldTag: "v4.0.0",
			NewTag: "v4.1.0",
			File:   ".github/workflows/ci.yml",
		},
	}

	mismatches := Check(t.Context(), client, updates)
	if len(mismatches) != 0 {
		t.Errorf("expected no mismatches for non-SHA ref, got %d", len(mismatches))
	}
}

func TestCheckSkipsNoTag(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	defer srv.Close()

	client := github.NewClient("")
	client.SetBaseURL(srv.URL)

	updates := []diffparser.ActionUpdate{
		{
			Action: "actions/checkout",
			OldRef: sha40a,
			NewRef: sha40b,
			File:   ".github/workflows/ci.yml",
		},
	}

	mismatches := Check(t.Context(), client, updates)
	if len(mismatches) != 0 {
		t.Errorf("expected no mismatches when no tag, got %d", len(mismatches))
	}
}

func TestCheckDeduplicatesAPICalls(t *testing.T) {
	calls := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/actions/checkout/commits/v6.2.0", func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"sha":"` + sha40a + `"}`))
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := github.NewClient("")
	client.SetBaseURL(srv.URL)

	// Same action+tag in multiple files.
	updates := []diffparser.ActionUpdate{
		{Action: "actions/checkout", NewRef: sha40a, NewTag: "v6.2.0", File: ".github/workflows/ci.yml"},
		{Action: "actions/checkout", NewRef: sha40a, NewTag: "v6.2.0", File: ".github/workflows/build.yml"},
		{Action: "actions/checkout", NewRef: sha40a, NewTag: "v6.2.0", File: ".github/workflows/test.yml"},
	}

	mismatches := Check(t.Context(), client, updates)
	if len(mismatches) != 0 {
		t.Errorf("expected no mismatches, got %d", len(mismatches))
	}
	if calls != 1 {
		t.Errorf("expected 1 API call (deduplicated), got %d", calls)
	}
}

func TestCheckMultipleActions(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/actions/checkout/commits/v6.2.0", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"sha":"` + sha40a + `"}`))
	})
	mux.HandleFunc("/repos/actions/setup-go/commits/v5.1.0", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// Mismatch: tag resolves to sha40c but pin says sha40b.
		_, _ = w.Write([]byte(`{"sha":"` + sha40c + `"}`))
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := github.NewClient("")
	client.SetBaseURL(srv.URL)

	updates := []diffparser.ActionUpdate{
		{Action: "actions/checkout", NewRef: sha40a, NewTag: "v6.2.0", File: ".github/workflows/ci.yml"},
		{Action: "actions/setup-go", NewRef: sha40b, NewTag: "v5.1.0", File: ".github/workflows/ci.yml"},
	}

	mismatches := Check(t.Context(), client, updates)
	if len(mismatches) != 1 {
		t.Fatalf("expected 1 mismatch, got %d", len(mismatches))
	}
	if mismatches[0].Update.Action != "actions/setup-go" {
		t.Errorf("mismatch action = %q, want actions/setup-go", mismatches[0].Update.Action)
	}
}

func TestCheckAPIError(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"message":"Not Found"}`))
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := github.NewClient("")
	client.SetBaseURL(srv.URL)

	updates := []diffparser.ActionUpdate{
		{Action: "actions/checkout", NewRef: sha40a, NewTag: "v99.0.0", File: ".github/workflows/ci.yml"},
	}

	// API errors should not produce mismatches (graceful degradation).
	mismatches := Check(t.Context(), client, updates)
	if len(mismatches) != 0 {
		t.Errorf("expected no mismatches on API error, got %d", len(mismatches))
	}
}
