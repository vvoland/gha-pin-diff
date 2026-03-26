TypeScript project. Zero external runtime dependencies. `node:test` for testing.

## Build & Test

```
npm install
npm run build
npm test
npx tsc --noEmit
```

## Dist

Compiled JavaScript is committed in `dist/` and shipped with the action (composite action).
Rebuild with `npm run build`. CI checks that `dist/` is up to date.

## Architecture

`src/main.ts` orchestrates a pipeline: fetch PR files → parse diffs → compare refs → verify tag/SHA → render markdown → post comment.

```
src/main.ts              Entry point. Reads env vars, runs pipeline.
src/diffparser/          Parses unified diff patches for `uses:` ref changes.
src/github/              Thin GitHub REST client. Throws APIError on non-OK status.
src/compare/             Fetches commit comparisons concurrently (Promise.all).
src/pinverify/           Verifies SHA pins match their inline tag comments.
src/render/              Renders Markdown comment. Marker: <!-- gha-pin-diff -->
src/comment/             Upserts/deletes the bot comment on a PR.
dist/                    Compiled JavaScript output.
```

## Key types

- `ActionUpdate` — one action ref change (oldRef/newRef can be SHA or tag)
- `APIError` — typed HTTP error class
- `Result` — comparison data per action, includes `.err` for partial failures
- `Mismatch` — a tag comment that doesn't match the pinned SHA
- `MARKER` — HTML comment used to find/update bot comments

## Conventions

- No external runtime dependencies. Native `fetch` for API calls.
- Tests use `node:test` + `node:assert` (zero test dependencies).
- Tests use `node:http` `createServer` for API mocking.
- `*.test.ts` files named `moby.test.ts` are integration tests using real PR data.
- Errors from the GitHub API are always `APIError` instances.
- The action never fails a PR — runtime errors are logged, not fatal.
