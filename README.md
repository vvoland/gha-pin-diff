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
- **Step actions**: `uses: owner/repo@ref`
- **Reusable workflows**: `uses: owner/repo/.github/workflows/file.yml@ref`
- Inline tag comments (`# v1.2.3`) are used for display when present

## Behavior

| Scenario | Action |
|----------|--------|
| Version changes found | Post or update comment with diff summary |
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
  → render Markdown comment
  → create/update/delete bot comment (identified by <!-- gha-pin-diff --> marker)
```

## Development

```bash
go build ./...
go test ./...
go vet ./...
```

Requires Go 1.26. No external dependencies.
