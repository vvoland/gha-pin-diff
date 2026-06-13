import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parse } from "./parser.js";
const sha40a = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const sha40b = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const sha40c = "cccccccccccccccccccccccccccccccccccccccc";
const sha40d = "dddddddddddddddddddddddddddddddddddddddd";
function updatesEqual(a, b) {
    if (a.length === 0 && b.length === 0)
        return true;
    if (a.length !== b.length)
        return false;
    const key = (u) => `${u.action}|${u.oldRef}|${u.newRef}|${u.oldTag}|${u.newTag}|${u.file}|${u.oldDigest ?? ""}|${u.newDigest ?? ""}`;
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
        {
            name: "lazy-lock commit updates",
            patches: {
                "neovim/lazy-lock.json": "@@ -1,6 +1,6 @@\n" +
                    ' {\n' +
                    `-  "codecompanion.nvim": { "branch": "main", "commit": "${sha40a}" },\n` +
                    `+  "codecompanion.nvim": { "branch": "main", "commit": "${sha40b}" },\n` +
                    `-  "fzf-lua": { "branch": "main", "commit": "${sha40c}" },\n` +
                    `+  "fzf-lua": { "branch": "main", "commit": "${sha40d}" },\n` +
                    " }",
            },
            want: [
                {
                    action: "codecompanion.nvim",
                    oldRef: sha40a,
                    newRef: sha40b,
                    oldTag: "",
                    newTag: "",
                    file: "neovim/lazy-lock.json",
                },
                {
                    action: "fzf-lua",
                    oldRef: sha40c,
                    newRef: sha40d,
                    oldTag: "",
                    newTag: "",
                    file: "neovim/lazy-lock.json",
                },
            ],
        },
        {
            name: "lazy-lock additions and removals without pair are skipped",
            patches: {
                "lazy-lock.json": "@@ -1,4 +1,4 @@\n" +
                    ' {\n' +
                    `-  "mini.diff": { "branch": "main", "commit": "${sha40a}" },\n` +
                    `+  "plenary.nvim": { "branch": "master", "commit": "${sha40b}" },\n` +
                    " }",
            },
            want: [],
        },
        {
            name: "compose docker hub image version bump",
            patches: {
                "docker-compose.yml": "@@ -3,7 +3,7 @@ services:\n" +
                    "   web:\n" +
                    "-    image: nginx:1.25.0\n" +
                    "+    image: nginx:1.26.0\n" +
                    "     ports:\n",
            },
            want: [
                {
                    action: "nginx",
                    oldRef: "1.25.0", newRef: "1.26.0",
                    oldTag: "1.25.0", newTag: "1.26.0",
                    file: "docker-compose.yml",
                },
            ],
        },
        {
            name: "compose ghcr image resolves to a repo",
            patches: {
                "compose.yaml": "@@ -1,4 +1,4 @@ services:\n" +
                    "   app:\n" +
                    "-    image: ghcr.io/owner/repo:v1.2.3\n" +
                    "+    image: ghcr.io/owner/repo:v1.3.0\n",
            },
            want: [
                {
                    action: "ghcr.io/owner/repo",
                    oldRef: "v1.2.3", newRef: "v1.3.0",
                    oldTag: "v1.2.3", newTag: "v1.3.0",
                    file: "compose.yaml",
                    repo: "owner/repo",
                },
            ],
        },
        {
            name: "compose registry with port is not mistaken for a tag",
            patches: {
                "docker-compose.prod.yml": "@@ -1,3 +1,3 @@\n" +
                    "-    image: registry.example.com:5000/team/app:1.0\n" +
                    "+    image: registry.example.com:5000/team/app:2.0\n",
            },
            want: [
                {
                    action: "registry.example.com:5000/team/app",
                    oldRef: "1.0", newRef: "2.0",
                    oldTag: "1.0", newTag: "2.0",
                    file: "docker-compose.prod.yml",
                },
            ],
        },
        {
            name: "compose image with quotes and digest",
            patches: {
                "compose.yml": "@@ -1,3 +1,3 @@\n" +
                    `-    image: "postgres:15.2@sha256:${sha40a}${sha40a.slice(0, 24)}"\n` +
                    `+    image: "postgres:16.1@sha256:${sha40b}${sha40b.slice(0, 24)}"\n`,
            },
            want: [
                {
                    action: "postgres",
                    oldRef: "15.2", newRef: "16.1",
                    oldTag: "15.2", newTag: "16.1",
                    oldDigest: `sha256:${sha40a}${sha40a.slice(0, 24)}`,
                    newDigest: `sha256:${sha40b}${sha40b.slice(0, 24)}`,
                    file: "compose.yml",
                },
            ],
        },
        {
            name: "compose tag re-pinned to a new digest is reported",
            patches: {
                "docker-compose.yml": "@@ -1,3 +1,3 @@\n" +
                    `-    image: nginx:1.26.0@sha256:${sha40a}${sha40a.slice(0, 24)}\n` +
                    `+    image: nginx:1.26.0@sha256:${sha40b}${sha40b.slice(0, 24)}\n`,
            },
            want: [
                {
                    action: "nginx",
                    oldRef: "1.26.0", newRef: "1.26.0",
                    oldTag: "1.26.0", newTag: "1.26.0",
                    oldDigest: `sha256:${sha40a}${sha40a.slice(0, 24)}`,
                    newDigest: `sha256:${sha40b}${sha40b.slice(0, 24)}`,
                    file: "docker-compose.yml",
                },
            ],
        },
        {
            name: "compose image with unchanged tag is skipped",
            patches: {
                "docker-compose.yml": "@@ -1,5 +1,5 @@\n" +
                    "-    image: redis:7.2\n" +
                    "-    command: redis-server --appendonly no\n" +
                    "+    image: redis:7.2\n" +
                    "+    command: redis-server --appendonly yes\n",
            },
            want: [],
        },
        {
            name: "compose image rename is not paired",
            patches: {
                "docker-compose.yml": "@@ -1,3 +1,3 @@\n" +
                    "-    image: nginx:1.25\n" +
                    "+    image: caddy:2.7\n",
            },
            want: [],
        },
    ];
    for (const tt of tests) {
        it(tt.name, () => {
            const got = parse(tt.patches);
            assert.ok(updatesEqual(got, tt.want), `Parse() =\n  ${JSON.stringify(got)}\nwant\n  ${JSON.stringify(tt.want)}`);
        });
    }
});
describe("parse compose image home resolution", () => {
    const cases = [
        {
            name: "ghcr image maps to its GitHub repo",
            image: "ghcr.io/owner/repo",
            repo: "owner/repo",
            homeURL: "https://github.com/owner/repo",
        },
        {
            name: "official docker hub image",
            image: "nginx",
            homeURL: "https://hub.docker.com/_/nginx",
        },
        {
            name: "namespaced docker hub image",
            image: "grafana/grafana",
            homeURL: "https://hub.docker.com/r/grafana/grafana",
        },
        {
            name: "third-party registry",
            image: "quay.io/prometheus/prometheus",
            homeURL: "https://quay.io/prometheus/prometheus",
        },
    ];
    for (const c of cases) {
        it(c.name, () => {
            const got = parse({
                "docker-compose.yml": `-    image: ${c.image}:1.0\n` + `+    image: ${c.image}:2.0\n`,
            });
            assert.equal(got.length, 1);
            assert.equal(got[0].repo, c.repo);
            assert.equal(got[0].homeURL, c.homeURL);
        });
    }
});
//# sourceMappingURL=parser.test.js.map