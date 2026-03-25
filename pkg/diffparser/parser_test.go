package diffparser

import (
	"testing"
)

const (
	sha40a = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	sha40b = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	sha40c = "cccccccccccccccccccccccccccccccccccccccc"
	sha40d = "dddddddddddddddddddddddddddddddddddddd"
)

func TestParse(t *testing.T) {
	tests := []struct {
		name    string
		patches map[string]string
		want    []ActionUpdate
	}{
		{
			name: "single action update with tags",
			patches: map[string]string{
				".github/workflows/ci.yml": "@@ -10,7 +10,7 @@ jobs:\n" +
					"     steps:\n" +
					"-      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1\n" +
					"+      - uses: actions/checkout@0ad4b8fadaa221de15dcec353f45205ec38ea70b # v4.1.4\n" +
					"       - uses: actions/setup-go@0c52d547c9bc32b1aa3301fd7a9cb496313a4491 # v5.0.0",
			},
			want: []ActionUpdate{
				{
					Action: "actions/checkout",
					OldRef: "b4ffde65f46336ab88eb53be808477a3936bae11",
					NewRef: "0ad4b8fadaa221de15dcec353f45205ec38ea70b",
					OldTag: "v4.1.1",
					NewTag: "v4.1.4",
					File:   ".github/workflows/ci.yml",
				},
			},
		},
		{
			name: "multiple actions updated",
			patches: map[string]string{
				".github/workflows/ci.yml": "@@ -10,9 +10,9 @@ jobs:\n" +
					"     steps:\n" +
					"-      - uses: actions/checkout@" + sha40a + " # v4.0.0\n" +
					"+      - uses: actions/checkout@" + sha40b + " # v4.1.0\n" +
					"-      - uses: actions/setup-go@" + sha40c + " # v5.0.0\n" +
					"+      - uses: actions/setup-go@" + sha40d + " # v5.1.0",
			},
			want: []ActionUpdate{
				{
					Action: "actions/checkout",
					OldRef: sha40a, NewRef: sha40b,
					OldTag: "v4.0.0", NewTag: "v4.1.0",
					File: ".github/workflows/ci.yml",
				},
				{
					Action: "actions/setup-go",
					OldRef: sha40c, NewRef: sha40d,
					OldTag: "v5.0.0", NewTag: "v5.1.0",
					File: ".github/workflows/ci.yml",
				},
			},
		},
		{
			name: "no tag comments",
			patches: map[string]string{
				".github/workflows/ci.yml": "@@ -5,3 +5,3 @@\n" +
					"-      - uses: actions/checkout@" + sha40a + "\n" +
					"+      - uses: actions/checkout@" + sha40b,
			},
			want: []ActionUpdate{
				{
					Action: "actions/checkout",
					OldRef: sha40a, NewRef: sha40b,
					File: ".github/workflows/ci.yml",
				},
			},
		},
		{
			name: "reusable workflow with subpath",
			patches: map[string]string{
				".github/workflows/deploy.yml": "@@ -3,3 +3,3 @@\n" +
					"-    uses: org/repo/.github/workflows/deploy.yml@" + sha40a + " # v1.0.0\n" +
					"+    uses: org/repo/.github/workflows/deploy.yml@" + sha40b + " # v1.1.0",
			},
			want: []ActionUpdate{
				{
					Action: "org/repo/.github/workflows/deploy.yml",
					OldRef: sha40a, NewRef: sha40b,
					OldTag: "v1.0.0", NewTag: "v1.1.0",
					File: ".github/workflows/deploy.yml",
				},
			},
		},
		{
			name: "tag to SHA - initial pinning",
			patches: map[string]string{
				".github/workflows/ci.yml": "@@ -10,3 +10,3 @@\n" +
					"-      - uses: docker/setup-buildx-action@v3\n" +
					"+      - uses: docker/setup-buildx-action@" + sha40a + " # v4.0.0",
			},
			want: []ActionUpdate{
				{
					Action: "docker/setup-buildx-action",
					OldRef: "v3", NewRef: sha40a,
					OldTag: "v3", NewTag: "v4.0.0",
					File: ".github/workflows/ci.yml",
				},
			},
		},
		{
			name: "tag to tag",
			patches: map[string]string{
				".github/workflows/ci.yml": "@@ -10,3 +10,3 @@\n" +
					"-      - uses: actions/checkout@v4.1.1\n" +
					"+      - uses: actions/checkout@v4.1.4",
			},
			want: []ActionUpdate{
				{
					Action: "actions/checkout",
					OldRef: "v4.1.1", NewRef: "v4.1.4",
					OldTag: "v4.1.1", NewTag: "v4.1.4",
					File: ".github/workflows/ci.yml",
				},
			},
		},
		{
			name: "new action added - no old ref, skip",
			patches: map[string]string{
				".github/workflows/ci.yml": "@@ -10,3 +10,5 @@\n" +
					"       - uses: actions/checkout@" + sha40a + " # v4\n" +
					"+      - uses: actions/setup-node@" + sha40b + " # v4",
			},
			want: nil,
		},
		{
			name: "action removed - no new ref, skip",
			patches: map[string]string{
				".github/workflows/ci.yml": "@@ -10,5 +10,3 @@\n" +
					"-      - uses: actions/setup-node@" + sha40b + " # v4\n" +
					"       - uses: actions/checkout@" + sha40a + " # v4",
			},
			want: nil,
		},
		{
			name: "same ref - skip",
			patches: map[string]string{
				".github/workflows/ci.yml": "@@ -10,3 +10,3 @@\n" +
					"-      - uses: actions/checkout@" + sha40a + " # v4.1.1\n" +
					"+      - uses: actions/checkout@" + sha40a + " # v4.1.1",
			},
			want: nil,
		},
		{
			name: "same tag ref - skip",
			patches: map[string]string{
				".github/workflows/ci.yml": "@@ -10,3 +10,3 @@\n" +
					"-      - uses: actions/checkout@v4\n" +
					"+      - uses: actions/checkout@v4",
			},
			want: nil,
		},
		{
			name:    "empty patches",
			patches: map[string]string{},
			want:    nil,
		},
		{
			name: "multiple files",
			patches: map[string]string{
				".github/workflows/ci.yml": "@@ -5,3 +5,3 @@\n" +
					"-      - uses: actions/checkout@" + sha40a + " # v4.0.0\n" +
					"+      - uses: actions/checkout@" + sha40b + " # v4.1.0",
				".github/workflows/release.yml": "@@ -5,3 +5,3 @@\n" +
					"-      - uses: actions/checkout@" + sha40c + " # v3.0.0\n" +
					"+      - uses: actions/checkout@" + sha40d + " # v3.1.0",
			},
			want: []ActionUpdate{
				{
					Action: "actions/checkout",
					OldRef: sha40a, NewRef: sha40b,
					OldTag: "v4.0.0", NewTag: "v4.1.0",
					File: ".github/workflows/ci.yml",
				},
				{
					Action: "actions/checkout",
					OldRef: sha40c, NewRef: sha40d,
					OldTag: "v3.0.0", NewTag: "v3.1.0",
					File: ".github/workflows/release.yml",
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Parse(tt.patches)
			if !updatesEqual(got, tt.want) {
				t.Errorf("Parse() =\n  %+v\nwant\n  %+v", got, tt.want)
			}
		})
	}
}

func updatesEqual(a, b []ActionUpdate) bool {
	if len(a) == 0 && len(b) == 0 {
		return true
	}
	if len(a) != len(b) {
		return false
	}
	type key struct {
		Action, OldRef, NewRef, OldTag, NewTag, File string
	}
	setA := make(map[key]int)
	for _, u := range a {
		setA[key{u.Action, u.OldRef, u.NewRef, u.OldTag, u.NewTag, u.File}]++
	}
	setB := make(map[key]int)
	for _, u := range b {
		setB[key{u.Action, u.OldRef, u.NewRef, u.OldTag, u.NewTag, u.File}]++
	}
	if len(setA) != len(setB) {
		return false
	}
	for k, v := range setA {
		if setB[k] != v {
			return false
		}
	}
	return true
}
