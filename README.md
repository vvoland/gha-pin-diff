# gha-pin-diff

A GitHub Action that comments on pull requests with a human-readable diff summary when GitHub Actions versions change.

## Problem

When Dependabot (or a human) updates SHA-pinned actions, the PR diff is opaque:

```yaml
- uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1
+ uses: actions/checkout@0ad4b8fadaa221de15dcec353f45205ec38ea70b # v4.1.4
```

You can't tell what changed between those commits without manually visiting the compare URL.

**gha-pin-diff** automates this by posting a PR comment that summarizes the commits between the old and new refs for every updated action.

## Example Comment

> ### [`actions/checkout`](https://github.com/actions/checkout) `v4.1.1` → `v4.1.4`
>
> **3 commits** · [Compare](https://github.com/actions/checkout/compare/b4ffde6...0ad4b8f)
>
> | SHA | Message | Author | Date |
> |-----|---------|--------|------|
> | `0ad4b8f` | Fix sparse checkout on Windows | @dscho | 2024-04-15 |
> | `1e31de5` | Bump node version to 20 | @cory-miller | 2024-04-10 |
> | `af20bd3` | Update dependencies | @dependabot | 2024-04-08 |

## Usage

Add this workflow to your repository:

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
      - uses: your-org/gha-pin-diff@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github-token` | Yes | `${{ github.token }}` | GitHub token for API access |
| `pr-number` | No | Auto-detected | Pull request number |

### Required Permissions

| Scope | Level | Reason |
|-------|-------|--------|
| `contents` | `read` | Read PR file diffs |
| `pull-requests` | `write` | Post/update PR comments |

## What It Detects

- **SHA-to-SHA updates**: `@<old-sha>` → `@<new-sha>` (e.g. Dependabot digest bumps)
- **Tag-to-SHA pinning**: `@v3` → `@<sha> # v4.0.0` (initial pin + version bump)
- **Tag-to-tag updates**: `@v4.1.1` → `@v4.1.4`
- **Step actions**: `uses: owner/repo@<ref>`
- **Reusable workflows**: `uses: owner/repo/.github/workflows/file.yml@<ref>`
- Optional inline tag comments (`# v1.2.3`) are used for display

## What It Does NOT Do

- Block or fail the PR (informational only)
- Post duplicate comments (existing bot comments are updated in place)

## Behavior

| Scenario | Action |
|----------|--------|
| Action version changes found | Post/update comment with diff summary |
| No relevant changes | Delete existing bot comment (if any) |
| Compare API fails (e.g. repo deleted) | Show warning with manual compare link |
| More than 15 commits per action | Show last 15 with link to full comparison |

## Development

```bash
go test ./...
go build .
```

## License

MIT
