# AGENTS.md

Go 1.26 project. Zero external dependencies.

## Build & Test

```
go build ./...
go test ./...
go vet ./...
```

## Architecture

`main.go` orchestrates a pipeline: fetch PR files → parse diffs → compare refs → verify tag/SHA → render markdown → post comment.

```
main.go                  Entry point. Reads env vars, runs pipeline.
pkg/diffparser/          Parses unified diff patches for `uses:` ref changes.
pkg/github/              Thin GitHub REST client. Returns *APIError on non-OK status.
pkg/compare/             Fetches commit comparisons concurrently (sync.WaitGroup.Go).
pkg/pinverify/           Verifies SHA pins match their inline tag comments.
pkg/render/              Renders Markdown comment. Marker: <!-- gha-pin-diff -->
pkg/comment/             Upserts/deletes the bot comment on a PR.
```

## Key types

- `diffparser.ActionUpdate` — one action ref change (OldRef/NewRef can be SHA or tag)
- `github.APIError` — typed HTTP error, use `errors.AsType[*github.APIError]`
- `compare.Result` — comparison data per action, includes `.Err` for partial failures
- `pinverify.Mismatch` — a tag comment that doesn't match the pinned SHA
- `render.Marker` — HTML comment used to find/update bot comments

## Conventions

- No external dependencies. `net/http` only for API calls.
- Tests use `httptest.NewServer` for API mocking and `t.Context()` for context.
- `*_test.go` files named `moby_test.go` are integration tests using real PR data.
- Errors from the GitHub API are always `*github.APIError` (pointer receiver).
- The action never fails a PR — runtime errors are logged, not fatal.
