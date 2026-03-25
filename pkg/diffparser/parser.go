// Package diffparser extracts GitHub Action version changes from unified diff patches.
package diffparser

import (
	"regexp"
	"strings"
)

// ActionUpdate represents a single action whose version ref changed.
type ActionUpdate struct {
	Action string // e.g. "actions/checkout"
	OldRef string // git ref: 40-char SHA or tag name (e.g. "v3")
	NewRef string // git ref: 40-char SHA or tag name
	OldTag string // human-readable version (from inline comment or tag ref itself)
	NewTag string // human-readable version
	File   string // workflow file path
}

// usesRe matches a `uses:` line with owner/repo (optionally /path) @ any ref,
// and an optional inline tag comment like `# v4.1.1`.
//
// Capture groups:
//  1. action target (owner/repo or owner/repo/path)
//  2. ref (SHA, tag, or branch — everything between @ and whitespace)
//  3. tag comment (optional, without the leading "# ")
var usesRe = regexp.MustCompile(
	`uses:\s+([a-zA-Z0-9\-_.]+/[a-zA-Z0-9\-_.]+(?:/[^\s@]+)?)@(\S+?)` +
		`(?:\s+#\s*(\S+))?` +
		`\s*$`,
)

// isSHA reports whether s is a 40-character hexadecimal string.
func isSHA(s string) bool {
	if len(s) != 40 {
		return false
	}
	for _, c := range s {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}

// Parse scans unified diff patches from changed workflow files and returns
// all detected version changes. Each entry in patches maps a file path to
// the unified diff patch text (as returned by the GitHub PR files API).
func Parse(patches map[string]string) []ActionUpdate {
	var updates []ActionUpdate
	for file, patch := range patches {
		updates = append(updates, parsePatch(file, patch)...)
	}
	return updates
}

type ref struct {
	raw string // the ref as written after @
	tag string // from inline comment, or the raw ref itself if not a SHA
}

// bestTag returns the human-readable tag for display.
func (r ref) bestTag() string {
	if r.tag != "" {
		return r.tag
	}
	if !isSHA(r.raw) {
		return r.raw
	}
	return ""
}

func parsePatch(file, patch string) []ActionUpdate {
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
		r := ref{raw: m[2], tag: m[3]}
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
			if rems[i].raw == adds[i].raw {
				continue
			}
			updates = append(updates, ActionUpdate{
				Action: action,
				OldRef: rems[i].raw,
				NewRef: adds[i].raw,
				OldTag: rems[i].bestTag(),
				NewTag: adds[i].bestTag(),
				File:   file,
			})
		}
		delete(added, action)
	}
	return updates
}
