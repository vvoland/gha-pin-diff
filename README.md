# gha-pin-diff

A GitHub Action that comments on PRs with a diff summary for pinned GitHub Actions and Neovim `lazy-lock.json` updates.

## Why

Dependabot already shows commit information when it bumps action versions.
But when a **human** updates pinned actions — bulk re-pins, initial pinning, or manual upgrades — the PR diff is opaque:

```diff
- uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1
+ uses: actions/checkout@0ad4b8fadaa221de15dcec353f45205ec38ea70b # v4.1.4
```

Nobody is going to look up what changed between those two SHAs.
**gha-pin-diff** posts a PR comment summarizing the commits between the old and new refs.

More importantly, it **catches tag/SHA mismatches** — a wrong inline comment is invisible in review:

```yaml
# Looks fine, but the SHA is actually v6.0.2 — the comment lies.
- uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.1
```

## Example Output

> ### [`docker/setup-buildx-action`](https://github.com/docker/setup-buildx-action) `v3` → `v4.0.0`
>
> **3 commits** · [Compare](https://github.com/docker/setup-buildx-action/compare/v3...4d04d5d)
>
> | SHA | Message | Date |
> |-----|---------|------|
> | `4d04d5d` | Merge pull request #123 from docker/v4 | 2025-03-20 |
> | `abcdef1` | chore: bump buildx to 0.20 | 2025-03-19 |
> | `1234567` | feat: add support for new driver options | 2025-03-18 |

### Tag / SHA Mismatch Warning

When the pinned SHA doesn't match the tag in the inline comment:

> ### ⚠️ Tag / SHA Mismatch
>
> The following pins reference a SHA that does not match the tag in the comment:
>
> | Action | Tag | Expected SHA | Pinned SHA |
> |--------|-----|-------------|------------|
> | `actions/checkout` | `v6.0.1` | `8e8c483` | `de0fac2` |

This catches typos, stale comments, and copy-paste errors that are impossible to spot in review.

## Usage

```yaml
name: Action Pin Diff
on:
  pull_request:
    paths:
      - '.github/workflows/**'
      - '**/compose.y*ml'
      - '**/docker-compose*.y*ml'

permissions:
  contents: read
  pull-requests: write

jobs:
  pin-diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: vvoland/gha-pin-diff@v1
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

## Local Verification

You can also run pin verification locally against your `.github/workflows/` directory without a PR:

```bash
npm run local
```

Or specify a different project root:

```bash
npm run local -- /path/to/project
```

Set `GITHUB_TOKEN` to avoid API rate limits:

```bash
GITHUB_TOKEN=ghp_... npm run local
```

Example output when a mismatch is found:

```
found 8 SHA-pinned action(s) with tag comments

❌ 1 mismatch(es) found:

  .github/workflows/ci.yml:13: actions/checkout pinned to de0fac2 but v6.0.1 resolves to 8e8c483
```

The exit code is non-zero when mismatches are found, making it suitable for CI or pre-commit hooks.

## What It Detects

- **SHA → SHA**: `@old-sha` → `@new-sha # v4.1.4` (digest bumps)
- **Tag → SHA**: `@v3` → `@sha # v4.0.0` (initial pinning + upgrade)
- **Tag → Tag**: `@v4.1.1` → `@v4.1.4` (simple version bumps)
- **Tag comment changes**: `@sha # v6.0.2` → `@sha # v6.0.1` (same SHA, different comment)
- **Tag / SHA mismatch**: pinned SHA doesn't match what the tag comment resolves to
- **Image tag / digest mismatch**: a Compose tag no longer resolves to its pinned digest in the registry
- **Step actions**: `uses: owner/repo@ref`
- **Reusable workflows**: `uses: owner/repo/.github/workflows/file.yml@ref`
- **Neovim lazy.nvim lockfiles**: `lazy-lock.json` commit bumps
- **Docker Compose images**: `image: name:tag[@sha256:digest]` version bumps in `compose.yaml` / `docker-compose.yml`

For `lazy-lock.json`, the action resolves plugin aliases to GitHub repositories by
scanning `lua/plugins/**/*.lua` in the checked-out workspace. Without a checkout,
lazy-lock updates are still detected, but unresolved aliases are rendered without
repository links or compare URLs.

For Docker Compose files, `image:` tag changes are reported as version bumps.
`ghcr.io/owner/repo` images are mapped to their backing GitHub repository, so the
full commit comparison is shown just like an action. Images on other registries
(Docker Hub, Quay, private registries) are listed in a **🐳 Docker Images** table
linking to the registry page, since no commit history is available for them.
Digest-pinned references such as `nginx:1.26.0@sha256:...` keep the digest as the
immutable pin: it is shown alongside the tag, and re-pointing a tag to a new
digest is reported even when the tag itself is unchanged.

For digest-pinned images, the action queries the image's OCI registry (Docker
Hub, GHCR, or any distribution-spec registry, using an anonymous pull token when
required) to confirm the new tag still resolves to the pinned digest. A
disagreement, the tag was moved or the digest was hand-edited, is surfaced in an
**⚠️ Image Tag / Digest Mismatch** warning table, the Docker analog of the
tag/SHA mismatch check. Registries that need authentication or are unreachable
are skipped without failing the PR.

## Behavior

| Scenario | Action |
|----------|--------|
| Version changes found | Post or update comment with diff summary |
| Tag/SHA mismatch detected | Show warning table at top of comment |
| Image tag/digest mismatch detected | Show warning table at top of comment |
| No changes | Delete existing bot comment, if any |
| Compare API fails (deleted repo, etc.) | Show warning with manual compare link |
| Comment API returns 403 | Log a warning, write the diff to the workflow summary, and continue without failing the PR |
| >15 commits per action | Show last 15, link to full comparison |

The bot never fails a PR — errors are logged, not fatal.

## Development

### Build

```bash
npm install
npm run build
```

### Test

```bash
npm test
```

The `dist/` directory contains the compiled JavaScript and is committed to the repo
so the action can run directly without a build step.
