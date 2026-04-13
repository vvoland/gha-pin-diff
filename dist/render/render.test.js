import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { comment, MARKER, MAX_COMMITS_SHOWN } from "./render.js";
describe("comment", () => {
    it("returns empty for nil results", () => {
        assert.equal(comment([], []), "");
    });
    it("includes marker and content", () => {
        const results = [
            {
                update: {
                    action: "actions/checkout",
                    oldRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    newRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    oldTag: "v4.0.0",
                    newTag: "v4.1.0",
                    file: ".github/workflows/ci.yml",
                },
                compareURL: "https://github.com/actions/checkout/compare/aaa...bbb",
                totalCommits: 1,
                commits: [
                    {
                        sha: "abc1234567890abc1234567890abc1234567890ab",
                        message: "Fix something",
                        author: "alice",
                        date: new Date("2024-04-15T00:00:00Z"),
                    },
                ],
                err: null,
            },
        ];
        const got = comment(results, []);
        assert.ok(got.startsWith(MARKER));
        assert.ok(got.includes("## 🔄 Action Pin Diff"));
        assert.ok(got.includes("`v4.0.0` → `v4.1.0`"));
        assert.ok(got.includes("**1 commit**"));
        assert.ok(got.includes("| [`abc1234`](https://github.com/actions/checkout/commit/abc1234567890abc1234567890abc1234567890ab) | Fix something | 2024-04-15 |"));
    });
    it("handles errors", () => {
        const results = [
            {
                update: {
                    action: "actions/checkout",
                    oldRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    newRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    oldTag: "",
                    newTag: "",
                    file: ".github/workflows/ci.yml",
                },
                compareURL: "",
                totalCommits: 0,
                commits: [],
                err: new Error("404 not found"),
            },
        ];
        const got = comment(results, []);
        assert.ok(got.includes("⚠️ Could not fetch comparison"));
        assert.ok(got.includes("View diff manually"));
    });
    it("renders unresolved lazy-lock entries without broken links", () => {
        const results = [
            {
                update: {
                    action: "codecompanion.nvim",
                    oldRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    newRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    oldTag: "",
                    newTag: "",
                    file: "neovim/lazy-lock.json",
                },
                compareURL: "",
                totalCommits: 0,
                commits: [],
                err: new Error('cannot resolve owner/repo for "codecompanion.nvim"'),
            },
        ];
        const got = comment(results, []);
        assert.ok(got.includes("### `codecompanion.nvim`"));
        assert.ok(got.includes("Refs: `aaaaaaa` → `bbbbbbb`"));
        assert.ok(!got.includes("https://github.com/codecompanion.nvim"));
        assert.ok(!got.includes("View diff manually"));
    });
    it("truncates long commit lists", () => {
        const commits = Array.from({ length: 20 }, (_, i) => ({
            sha: `abc${String(i).padStart(4, "0")}567890abc1234567890abc1234567890ab`,
            message: `Commit ${i}`,
            author: "dev",
            date: new Date("2024-04-15T00:00:00Z"),
        }));
        const results = [
            {
                update: {
                    action: "actions/checkout",
                    oldRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    newRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    oldTag: "v4.0.0",
                    newTag: "v4.1.0",
                    file: ".github/workflows/ci.yml",
                },
                compareURL: "https://github.com/actions/checkout/compare/aaa...bbb",
                totalCommits: 20,
                commits,
                err: null,
            },
        ];
        const got = comment(results, []);
        assert.ok(got.includes(`Showing ${MAX_COMMITS_SHOWN} of 20 commits`));
        const rows = got.split("\n").filter((l) => l.startsWith("| [`")).length;
        assert.equal(rows, MAX_COMMITS_SHOWN);
    });
    it("sorts by action name", () => {
        const results = [
            {
                update: {
                    action: "zzz/last",
                    oldRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    newRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    oldTag: "",
                    newTag: "",
                    file: ".github/workflows/z.yml",
                },
                totalCommits: 0,
                compareURL: "",
                commits: [],
                err: null,
            },
            {
                update: {
                    action: "aaa/first",
                    oldRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    newRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    oldTag: "",
                    newTag: "",
                    file: ".github/workflows/a.yml",
                },
                totalCommits: 0,
                compareURL: "",
                commits: [],
                err: null,
            },
        ];
        const got = comment(results, []);
        const idxFirst = got.indexOf("aaa/first");
        const idxLast = got.indexOf("zzz/last");
        assert.ok(idxFirst < idxLast, "results should be sorted by action name");
    });
    it("deduplicates results", () => {
        const base = {
            update: {
                action: "actions/checkout",
                oldRef: "v6",
                newRef: "de0fac2e4500dabe0009e67214ff5f5447ce83dd",
                oldTag: "v6",
                newTag: "v6",
                file: "",
            },
            compareURL: "https://github.com/actions/checkout/compare/v6...de0fac2e4500dabe0009e67214ff5f5447ce83dd",
            totalCommits: 0,
            commits: [],
            err: null,
        };
        const results = [
            "ci.yml",
            "build.yml",
            "test.yml",
            "release.yml",
            "lint.yml",
        ].map((f) => ({
            ...base,
            update: { ...base.update, file: `.github/workflows/${f}` },
        }));
        const got = comment(results, []);
        const count = got.split("[`actions/checkout`]").length - 1;
        assert.equal(count, 1);
        assert.ok(got.includes("📌 Pinned"));
    });
    it("handles different refs for same action", () => {
        const results = [
            {
                update: {
                    action: "actions/checkout",
                    oldRef: "v5",
                    newRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    oldTag: "v5",
                    newTag: "v6",
                    file: ".github/workflows/ci.yml",
                },
                totalCommits: 3,
                compareURL: "",
                commits: [],
                err: null,
            },
            {
                update: {
                    action: "actions/checkout",
                    oldRef: "v6",
                    newRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    oldTag: "v6",
                    newTag: "v6",
                    file: ".github/workflows/ci.yml",
                },
                totalCommits: 0,
                compareURL: "",
                commits: [],
                err: null,
            },
        ];
        const got = comment(results, []);
        assert.ok(got.includes("`v5` → `v6`"));
        assert.ok(got.includes("📌 Pinned"));
    });
    it("renders pin-only results", () => {
        const results = [
            {
                update: {
                    action: "actions/checkout",
                    oldRef: "v6",
                    newRef: "de0fac2e4500dabe0009e67214ff5f5447ce83dd",
                    oldTag: "v6",
                    newTag: "v6",
                    file: ".github/workflows/ci.yml",
                },
                compareURL: "https://github.com/actions/checkout/compare/v6...de0fac2e4500dabe0009e67214ff5f5447ce83dd",
                totalCommits: 0,
                commits: [],
                err: null,
            },
            {
                update: {
                    action: "actions/setup-go",
                    oldRef: "v6",
                    newRef: "4b73464bb391d4059bd26b0524d20df3927bd417",
                    oldTag: "v6",
                    newTag: "v6",
                    file: ".github/workflows/ci.yml",
                },
                compareURL: "https://github.com/actions/setup-go/compare/v6...4b73464bb391d4059bd26b0524d20df3927bd417",
                totalCommits: 0,
                commits: [],
                err: null,
            },
            {
                update: {
                    action: "actions/upload-artifact",
                    oldRef: "v7",
                    newRef: "bbbca2ddaa5d8feaa63e36b76fdaad77386f024f",
                    oldTag: "v7",
                    newTag: "v7",
                    file: ".github/workflows/ci.yml",
                },
                compareURL: "https://github.com/actions/upload-artifact/compare/v7...bbbca2ddaa5d8feaa63e36b76fdaad77386f024f",
                totalCommits: 0,
                commits: [],
                err: null,
            },
        ];
        const got = comment(results, []);
        assert.ok(got.includes("📌 Pinned (digest unchanged)"));
        for (const action of [
            "actions/checkout",
            "actions/setup-go",
            "actions/upload-artifact",
        ]) {
            const count = got.split(`[\`${action}\`]`).length - 1;
            assert.equal(count, 1, `${action} should appear once`);
        }
        assert.ok(got.includes("[`de0fac2`](https://github.com/actions/checkout/commit/de0fac2e4500dabe0009e67214ff5f5447ce83dd)"));
        assert.ok(got.includes("[`4b73464`](https://github.com/actions/setup-go/commit/4b73464bb391d4059bd26b0524d20df3927bd417)"));
        assert.ok(got.includes("[`bbbca2d`](https://github.com/actions/upload-artifact/commit/bbbca2ddaa5d8feaa63e36b76fdaad77386f024f)"));
        assert.ok(!got.includes("**0 commits**"));
    });
    it("renders pin-only all same action", () => {
        const results = [];
        for (let i = 0; i < 5; i++) {
            results.push({
                update: {
                    action: "actions/checkout",
                    oldRef: "v6",
                    newRef: "de0fac2e4500dabe0009e67214ff5f5447ce83dd",
                    oldTag: "v6",
                    newTag: "v6",
                    file: `.github/workflows/file${i}.yml`,
                },
                totalCommits: 0,
                compareURL: "",
                commits: [],
                err: null,
            });
        }
        for (let i = 0; i < 4; i++) {
            results.push({
                update: {
                    action: "actions/setup-go",
                    oldRef: "v6",
                    newRef: "4b73464bb391d4059bd26b0524d20df3927bd417",
                    oldTag: "v6",
                    newTag: "v6",
                    file: `.github/workflows/file${i}.yml`,
                },
                totalCommits: 0,
                compareURL: "",
                commits: [],
                err: null,
            });
        }
        const got = comment(results, []);
        assert.equal(got.split("[`actions/checkout`]").length - 1, 1);
        assert.equal(got.split("[`actions/setup-go`]").length - 1, 1);
        assert.ok(!got.includes("**0 commits**"));
    });
    it("renders mismatches", () => {
        const sha40a = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        const sha40b = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        const mismatches = [
            {
                update: {
                    action: "actions/checkout",
                    oldRef: "v6",
                    newRef: sha40a,
                    oldTag: "v6",
                    newTag: "v6.2.0",
                    file: ".github/workflows/ci.yml",
                },
                tag: "v6.2.0",
                expectSHA: sha40b,
            },
        ];
        const got = comment([], mismatches);
        assert.ok(got.startsWith(MARKER));
        assert.ok(got.includes("⚠️ Tag / SHA Mismatch"));
        assert.ok(got.includes("`v6.2.0`"));
        assert.ok(got.includes("[`aaaaaaa`]"));
        assert.ok(got.includes("[`bbbbbbb`]"));
        assert.ok(got.includes("does not match the tag"));
    });
    it("renders mismatches before results", () => {
        const sha40a = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        const sha40b = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        const sha40c = "cccccccccccccccccccccccccccccccccccccccc";
        const results = [
            {
                update: {
                    action: "actions/setup-go",
                    oldRef: sha40b,
                    newRef: sha40c,
                    oldTag: "v5.0.0",
                    newTag: "v5.1.0",
                    file: ".github/workflows/ci.yml",
                },
                totalCommits: 1,
                compareURL: "",
                commits: [
                    {
                        sha: sha40c,
                        message: "bump",
                        author: "dev",
                        date: new Date("2024-04-15T00:00:00Z"),
                    },
                ],
                err: null,
            },
        ];
        const mismatches = [
            {
                update: {
                    action: "actions/checkout",
                    oldRef: "",
                    newRef: sha40a,
                    oldTag: "",
                    newTag: "v6.2.0",
                    file: "",
                },
                tag: "v6.2.0",
                expectSHA: sha40b,
            },
        ];
        const got = comment(results, mismatches);
        const mismatchIdx = got.indexOf("⚠️ Tag / SHA Mismatch");
        const setupGoIdx = got.indexOf("actions/setup-go");
        assert.ok(mismatchIdx >= 0);
        assert.ok(setupGoIdx >= 0);
        assert.ok(mismatchIdx < setupGoIdx, "mismatch section should appear before regular results");
    });
});
//# sourceMappingURL=render.test.js.map