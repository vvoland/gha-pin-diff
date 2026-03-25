package comment

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/vvoland/gha-pin-diff/pkg/github"
	"github.com/vvoland/gha-pin-diff/pkg/render"
)

func TestEnsureCreatesComment(t *testing.T) {
	var created bool
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/o/r/issues/1/comments", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode([]map[string]any{})
			return
		}
		if r.Method == http.MethodPost {
			created = true
			w.WriteHeader(http.StatusCreated)
			return
		}
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()
	client := github.NewClient("")
	client.SetBaseURL(srv.URL)

	err := Ensure(t.Context(), client, "o", "r", 1, "new body")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !created {
		t.Error("expected comment to be created")
	}
}

func TestEnsureUpdatesExistingComment(t *testing.T) {
	var updated bool
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/o/r/issues/1/comments", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]map[string]any{
			{"id": 42, "body": "old " + render.Marker, "user": map[string]string{"login": "bot"}},
		})
	})
	mux.HandleFunc("/repos/o/r/issues/comments/42", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPatch {
			updated = true
			w.WriteHeader(http.StatusOK)
			return
		}
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()
	client := github.NewClient("")
	client.SetBaseURL(srv.URL)

	err := Ensure(t.Context(), client, "o", "r", 1, "updated body")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !updated {
		t.Error("expected comment to be updated")
	}
}

func TestEnsureDeletesWhenEmpty(t *testing.T) {
	var deleted bool
	var mu sync.Mutex
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/o/r/issues/1/comments", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]map[string]any{
			{"id": 42, "body": "old " + render.Marker, "user": map[string]string{"login": "bot"}},
		})
	})
	mux.HandleFunc("/repos/o/r/issues/comments/42", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			mu.Lock()
			deleted = true
			mu.Unlock()
			w.WriteHeader(http.StatusNoContent)
			return
		}
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()
	client := github.NewClient("")
	client.SetBaseURL(srv.URL)

	err := Ensure(t.Context(), client, "o", "r", 1, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	mu.Lock()
	defer mu.Unlock()
	if !deleted {
		t.Error("expected comment to be deleted when body is empty")
	}
}

func TestEnsureNoOpWhenEmptyAndNoComment(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/o/r/issues/1/comments", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]map[string]any{})
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()
	client := github.NewClient("")
	client.SetBaseURL(srv.URL)

	err := Ensure(t.Context(), client, "o", "r", 1, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}
