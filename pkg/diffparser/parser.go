// Package diffparser extracts GitHub Action SHA-pin changes from unified diff patches.
package diffparser

import (
	"regexp"
	"strings"
)

// ActionUpdate represents a single action whose pinned SHA changed.
type ActionUpdate struct {
	Action string // e.g. "actions/checkout"
	OldRef string // 40-char hex SHA
	NewRef string // 40-char hex SHA
	OldTag string // e.g. "v4.1.1" (from inline comment, may be empty)
	NewTag string // e.g. "v4.1.4"
	File   string // workflow file path
}

// usesRe matches a `uses:` line with an owner/repo (optionally /path) @ 40-hex SHA,
// and an optional inline tag comment like `# v4.1.1`.
//
// Capture groups:
//  1. action target (owner/repo or owner/repo/path)
//  2. 40-char SHA
//  3. tag comment (optional, without the leading "# ")
var usesRe = regexp.MustCompile(
	`uses:\s+([a-zA-Z0-9\-_.]+/[a-zA-Z0-9\-_.]+(?:/[^\s@]+)?)@([0-9a-f]{40})` +
		`(?:\s+#\s*(\S+))?`,
)

// Parse scans unified diff patches from changed workflow files and returns
// all detected SHA-pin updates. Each entry in patches maps a file path to
// the unified diff patch text (as returned by the GitHub PR files API).
func Parse(patches map[string]string) []ActionUpdate {
	var updates []ActionUpdate
	for file, patch := range patches {
		updates = append(updates, parsePatch(file, patch)...)
	}
	return updates
}

func parsePatch(file, patch string) []ActionUpdate {
	type ref struct {
		sha string
		tag string
	}

	removed := make(map[string][]ref) // action -> list of removed refs
	added := make(map[string][]ref)   // action -> list of added refs

	for line := range strings.Lines(patch) {
		line = strings.TrimRight(line, "\n")
		if len(line) == 0 {
			continue
		}

		prefix := line[0]
		if prefix != '-' && prefix != '+' {
			continue
		}

		m := usesRe.FindStringSubmatch(line[1:]) // skip the diff prefix char
		if m == nil {
			continue
		}

		action := m[1]
		sha := m[2]
		tag := m[3]

		r := ref{sha: sha, tag: tag}
		if prefix == '-' {
			removed[action] = append(removed[action], r)
		} else {
			added[action] = append(added[action], r)
		}
	}

	var updates []ActionUpdate
	for action, rems := range removed {
		adds := added[action]
		n := min(len(rems), len(adds))
		for i := range n {
			if rems[i].sha == adds[i].sha {
				continue
			}
			updates = append(updates, ActionUpdate{
				Action: action,
				OldRef: rems[i].sha,
				NewRef: adds[i].sha,
				OldTag: rems[i].tag,
				NewTag: adds[i].tag,
				File:   file,
			})
		}
		delete(added, action)
	}
	return updates
}
