import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parse } from "./parser.js";
const sha40a = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const sha40b = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const sha40c = "cccccccccccccccccccccccccccccccccccccccc";
const sha40d = "dddddddddddddddddddddddddddddddddddddd";
function updatesEqual(a, b) {
    if (a.length === 0 && b.length === 0)
        return true;
    if (a.length !== b.length)
        return false;
    const key = (u) => `${u.action}|${u.oldRef}|${u.newRef}|${u.oldTag}|${u.newTag}|${u.file}`;
    const setA = new Map();
    for (const u of a)
        setA.set(key(u), (setA.get(key(u)) || 0) + 1);
    const setB = new Map();
    for (const u of b)
        setB.set(key(u), (setB.get(key(u)) || 0) + 1);
    if (setA.size !== setB.size)
        return false;
    for (const [k, v] of setA) {
        if (setB.get(k) !== v)
            return false;
    }
    return true;
}
describe("parse", () => {
    const tests = [
        {
            name: "single action update with tags",
            patches: {
                ".github/workflows/ci.yml": "@@ -10,7 +10,7 @@ jobs:\n" +
                    "     steps:\n" +
                    "-      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1\n" +
                    "+      - uses: actions/checkout@0ad4b8fadaa221de15dcec353f45205ec38ea70b # v4.1.4\n" +
                    "       - uses: actions/setup-go@0c52d547c9bc32b1aa3301fd7a9cb496313a4491 # v5.0.0",
            },
            want: [
                {
                    action: "actions/checkout",
                    oldRef: "b4ffde65f46336ab88eb53be808477a3936bae11",
                    newRef: "0ad4b8fadaa221de15dcec353f45205ec38ea70b",
                    oldTag: "v4.1.1",
                    newTag: "v4.1.4",
                    file: ".github/workflows/ci.yml",
                },
            ],
        },
        {
            name: "multiple actions updated",
            patches: {
                ".github/workflows/ci.yml": "@@ -10,9 +10,9 @@ jobs:\n" +
                    "     steps:\n" +
                    `-      - uses: actions/checkout@${sha40a} # v4.0.0\n` +
                    `+      - uses: actions/checkout@${sha40b} # v4.1.0\n` +
                    `-      - uses: actions/setup-go@${sha40c} # v5.0.0\n` +
                    `+      - uses: actions/setup-go@${sha40d} # v5.1.0`,
            },
            want: [
                {
                    action: "actions/checkout",
                    oldRef: sha40a, newRef: sha40b,
                    oldTag: "v4.0.0", newTag: "v4.1.0",
                    file: ".github/workflows/ci.yml",
                },
                {
                    action: "actions/setup-go",
                    oldRef: sha40c, newRef: sha40d,
                    oldTag: "v5.0.0", newTag: "v5.1.0",
                    file: ".github/workflows/ci.yml",
                },
            ],
        },
        {
            name: "no tag comments",
            patches: {
                ".github/workflows/ci.yml": "@@ -5,3 +5,3 @@\n" +
                    `-      - uses: actions/checkout@${sha40a}\n` +
                    `+      - uses: actions/checkout@${sha40b}`,
            },
            want: [
                {
                    action: "actions/checkout",
                    oldRef: sha40a, newRef: sha40b,
                    oldTag: "", newTag: "",
                    file: ".github/workflows/ci.yml",
                },
            ],
        },
        {
            name: "reusable workflow with subpath",
            patches: {
                ".github/workflows/deploy.yml": "@@ -3,3 +3,3 @@\n" +
                    `-    uses: org/repo/.github/workflows/deploy.yml@${sha40a} # v1.0.0\n` +
                    `+    uses: org/repo/.github/workflows/deploy.yml@${sha40b} # v1.1.0`,
            },
            want: [
                {
                    action: "org/repo/.github/workflows/deploy.yml",
                    oldRef: sha40a, newRef: sha40b,
                    oldTag: "v1.0.0", newTag: "v1.1.0",
                    file: ".github/workflows/deploy.yml",
                },
            ],
        },
        {
            name: "tag to SHA - initial pinning",
            patches: {
                ".github/workflows/ci.yml": "@@ -10,3 +10,3 @@\n" +
                    "-      - uses: docker/setup-buildx-action@v3\n" +
                    `+      - uses: docker/setup-buildx-action@${sha40a} # v4.0.0`,
            },
            want: [
                {
                    action: "docker/setup-buildx-action",
                    oldRef: "v3", newRef: sha40a,
                    oldTag: "v3", newTag: "v4.0.0",
                    file: ".github/workflows/ci.yml",
                },
            ],
        },
        {
            name: "tag to tag",
            patches: {
                ".github/workflows/ci.yml": "@@ -10,3 +10,3 @@\n" +
                    "-      - uses: actions/checkout@v4.1.1\n" +
                    "+      - uses: actions/checkout@v4.1.4",
            },
            want: [
                {
                    action: "actions/checkout",
                    oldRef: "v4.1.1", newRef: "v4.1.4",
                    oldTag: "v4.1.1", newTag: "v4.1.4",
                    file: ".github/workflows/ci.yml",
                },
            ],
        },
        {
            name: "new action added - no old ref, skip",
            patches: {
                ".github/workflows/ci.yml": "@@ -10,3 +10,5 @@\n" +
                    `       - uses: actions/checkout@${sha40a} # v4\n` +
                    `+      - uses: actions/setup-node@${sha40b} # v4`,
            },
            want: [],
        },
        {
            name: "action removed - no new ref, skip",
            patches: {
                ".github/workflows/ci.yml": "@@ -10,5 +10,3 @@\n" +
                    `-      - uses: actions/setup-node@${sha40b} # v4\n` +
                    `       - uses: actions/checkout@${sha40a} # v4`,
            },
            want: [],
        },
        {
            name: "same ref and tag - skip",
            patches: {
                ".github/workflows/ci.yml": "@@ -10,3 +10,3 @@\n" +
                    `-      - uses: actions/checkout@${sha40a} # v4.1.1\n` +
                    `+      - uses: actions/checkout@${sha40a} # v4.1.1`,
            },
            want: [],
        },
        {
            name: "same ref but tag comment changed",
            patches: {
                ".github/workflows/ci.yml": "@@ -10,3 +10,3 @@\n" +
                    `-      - uses: actions/checkout@${sha40a} # v6.0.2\n` +
                    `+      - uses: actions/checkout@${sha40a} # v6.0.1`,
            },
            want: [
                {
                    action: "actions/checkout",
                    oldRef: sha40a, newRef: sha40a,
                    oldTag: "v6.0.2", newTag: "v6.0.1",
                    file: ".github/workflows/ci.yml",
                },
            ],
        },
        {
            name: "same tag ref - skip",
            patches: {
                ".github/workflows/ci.yml": "@@ -10,3 +10,3 @@\n" +
                    "-      - uses: actions/checkout@v4\n" +
                    "+      - uses: actions/checkout@v4",
            },
            want: [],
        },
        {
            name: "empty patches",
            patches: {},
            want: [],
        },
        {
            name: "multiple files",
            patches: {
                ".github/workflows/ci.yml": "@@ -5,3 +5,3 @@\n" +
                    `-      - uses: actions/checkout@${sha40a} # v4.0.0\n` +
                    `+      - uses: actions/checkout@${sha40b} # v4.1.0`,
                ".github/workflows/release.yml": "@@ -5,3 +5,3 @@\n" +
                    `-      - uses: actions/checkout@${sha40c} # v3.0.0\n` +
                    `+      - uses: actions/checkout@${sha40d} # v3.1.0`,
            },
            want: [
                {
                    action: "actions/checkout",
                    oldRef: sha40a, newRef: sha40b,
                    oldTag: "v4.0.0", newTag: "v4.1.0",
                    file: ".github/workflows/ci.yml",
                },
                {
                    action: "actions/checkout",
                    oldRef: sha40c, newRef: sha40d,
                    oldTag: "v3.0.0", newTag: "v3.1.0",
                    file: ".github/workflows/release.yml",
                },
            ],
        },
    ];
    for (const tt of tests) {
        it(tt.name, () => {
            const got = parse(tt.patches);
            assert.ok(updatesEqual(got, tt.want), `Parse() =\n  ${JSON.stringify(got)}\nwant\n  ${JSON.stringify(tt.want)}`);
        });
    }
});
//# sourceMappingURL=parser.test.js.map