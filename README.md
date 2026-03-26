# gha-pin-diff

A GitHub Action that comments on PRs with a human-readable diff summary when GitHub Action versions change in workflow files.

## Problem

When Dependabot or a human updates actions in `.github/workflows/`, the diff is opaque:

```yaml
- uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1
+ uses: actions/checkout@0ad4b8fadaa221de15dcec353f45205ec38ea70b # v4.1.4
```

**gha-pin-diff** posts a PR comment summarizing what changed between the old and new refs.

## Example Output

> ### [`docker/setup-buildx-action`](https://github.com/docker/setup-buildx-action) `v3` → `v4.0.0`
>
> **3 commits** · [Compare](https://github.com/docker/setup-buildx-action/compare/v3...4d04d5d)
>
> | SHA | Message | Author | Date |
> |-----|---------|--------|------|
> | `4d04d5d` | Merge pull request #123 from docker/v4 | @crazy-max | 2025-03-20 |
> | `abcdef1` | chore: bump buildx to 0.20 | @crazy-max | 2025-03-19 |
> | `1234567` | feat: add support for new driver options | @tonistiigi | 2025-03-18 |

### Tag / SHA Mismatch Warning

When the pinned SHA doesn't match the tag in the inline comment, a warning is shown:

> ### ⚠️ Tag / SHA Mismatch
>
> The following pins reference a SHA that does not match the tag in the comment:
>
> | Action | Tag | Expected SHA | Pinned SHA |
> |--------|-----|-------------|------------|
> | `actions/checkout` | `v6.2.0` | `bbbbbbb` | `aaaaaaa` |

## Usage

```yaml
name: Action Pin Diff
on:
  pull_request:
    paths:
      - '.github/workflows/**'

permissions:
  contents: read
  pull-requests: write

jobs:
  pin-diff:
    runs-on: ubuntu-latest
    steps:
      - uses: vvoland/gha-pin-diff@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github-token` | Yes | `${{ github.token }}` | GitHub token for API access |

### Permissions

| Scope | Level | Reason |
|-------|-------|--------|
| `contents` | `read` | Read PR file diffs |
| `pull-requests` | `write` | Post/update PR comments |

## What It Detects

- **SHA → SHA**: `@old-sha` → `@new-sha # v4.1.4` (Dependabot digest bumps)
- **Tag → SHA**: `@v3` → `@sha # v4.0.0` (initial pinning + upgrade)
- **Tag → Tag**: `@v4.1.1` → `@v4.1.4` (simple version bumps)
- **Tag / SHA mismatch**: `@sha # v6.2.0` where the SHA doesn't match what `v6.2.0` resolves to
- **Step actions**: `uses: owner/repo@ref`
- **Reusable workflows**: `uses: owner/repo/.github/workflows/file.yml@ref`
- Inline tag comments (`# v1.2.3`) are used for display when present

## Behavior

| Scenario | Action |
|----------|--------|
| Version changes found | Post or update comment with diff summary |
| Tag/SHA mismatch detected | Show warning table at top of comment |
| No changes | Delete existing bot comment, if any |
| Compare API fails (deleted repo, etc.) | Show warning with manual compare link |
| >15 commits per action | Show last 15, link to full comparison |

The bot never fails a PR — errors are logged, not fatal.

## How It Works

```
PR event
  → fetch changed files (GitHub REST API)
  → filter .github/workflows/**
  → parse unified diff for `uses:` line changes
  → compare old...new refs (GitHub compare API, concurrently)
  → verify tag/SHA consistency (resolve tags concurrently)
  → render Markdown comment
  → create/update/delete bot comment (identified by <!-- gha-pin-diff --> marker)
```

## Development

```bash
go build ./...
go test ./...
go vet ./...
```

### Reproducible Binary

Build a reproducible binary for the host platform using `docker buildx bake`:

```bash
docker buildx bake
# Output: ./build/gha-pin-diff
```

### Dist Binaries

The action ships pre-built binaries in `dist/` for all supported platforms.
Rebuild them with:

```bash
docker buildx bake dist
```

This produces binaries under `dist/<os>/<arch>/gha-pin-diff`:

- `linux/amd64`, `linux/arm64`
- `darwin/amd64`, `darwin/arm64`
- `windows/amd64`, `windows/arm64`

The build uses `-trimpath`, `-buildvcs=false`, `-ldflags="-s -w"`, and `SOURCE_DATE_EPOCH=0`
to ensure binaries are reproducible across builds.

CI verifies that `dist/` is up to date — if you change Go source, you must rebuild
and commit the dist binaries.

Requires Go 1.26. No external dependencies.
