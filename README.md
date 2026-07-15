# gha-pin-diff

**gha-pin-diff** is a GitHub Action that reviews dependency pin changes. It
summarizes changes between refs and warns when tags do not match pinned SHAs or
digests.

Currently supports:

- GitHub Actions
- Neovim `lazy-lock.json` files
- OCI image references in Compose files

## Why

PR diffs show changed SHAs but not the commits between them. **gha-pin-diff**
adds the commit summary and warns when an inline tag does not match its SHA.

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

> ### ⚠️ Tag / SHA Mismatch
>
> The following pins reference a SHA that does not match the tag in the comment:
>
> | Action | Tag | Expected SHA | Pinned SHA |
> |--------|-----|-------------|------------|
> | `actions/checkout` | `v6.0.1` | `8e8c483` | `de0fac2` |

## Usage

```yaml
name: Action Pin Diff
on:
  pull_request:

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
| `contents` | `read` | Compare commits and resolve tags |
| `pull-requests` | `write` | Read PR file diffs and post/update comments |

## Local Verification

Verify pins in `.github/workflows/` without a PR:

```bash
npm run local
```

To use another project root:

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

Mismatches return a non-zero exit code for use in CI or pre-commit hooks.

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
- **OCI image references**: `image: name:tag[@sha256:digest]` version bumps in Compose files

Linking `lazy-lock.json` aliases requires a checkout so the action can scan
`lua/plugins/**/*.lua`. Updates are still detected without one.

GHCR images include GitHub commit comparisons; other images link to their
registry pages. Digest changes are reported even when the tag is unchanged.
Public OCI registries are checked for tag/digest mismatches. Private-network,
authenticated, and unreachable registries are skipped.

## Behavior

| Scenario | Action |
|----------|--------|
| Version changes found | Post or update comment with diff summary |
| Tag/SHA mismatch detected | Show warning table at top of comment |
| Image tag/digest mismatch detected | Show warning table at top of comment |
| No changes | Delete existing bot comment, if any |
| Compare API fails (deleted repo, etc.) | Show warning with manual compare link |
| Comment API denies integration access | Log a warning, write the diff to the workflow summary, and continue without failing the PR |
| >15 commits per action | Show last 15, link to full comparison |

Comparison, tag-resolution, and registry-resolution errors are logged instead
of failing the PR. Other runtime errors fail the action step.

## Development

```bash
npm install
npm run build
npm test
```

The committed `dist/` directory contains the compiled JavaScript, so the action
can run without a build step.
