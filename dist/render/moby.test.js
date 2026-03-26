import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { comment, MARKER } from "./render.js";
describe("moby PR 52217 render", () => {
    it("renders the full comment", () => {
        const sha = "4d04d5d9486b7bd6fa91e7baf45bbb4f8b9deedd";
        const results = [
            {
                update: {
                    action: "docker/setup-buildx-action",
                    oldRef: "v3",
                    newRef: sha,
                    oldTag: "v3",
                    newTag: "v4.0.0",
                    file: ".github/workflows/ci.yml",
                },
                compareURL: `https://github.com/docker/setup-buildx-action/compare/v3...${sha}`,
                totalCommits: 3,
                commits: [
                    {
                        sha: "4d04d5d9486b7bd6fa91e7baf45bbb4f8b9deedd",
                        message: "Merge pull request #123 from docker/v4",
                        author: "crazy-max",
                        date: new Date("2025-03-20T10:00:00Z"),
                    },
                    {
                        sha: "abcdef1234567890abcdef1234567890abcdef12",
                        message: "chore: bump buildx to 0.20",
                        author: "crazy-max",
                        date: new Date("2025-03-19T09:00:00Z"),
                    },
                    {
                        sha: "1234567890abcdef1234567890abcdef12345678",
                        message: "feat: add support for new driver options",
                        author: "tonistiigi",
                        date: new Date("2025-03-18T08:00:00Z"),
                    },
                ],
                err: null,
            },
        ];
        const got = comment(results, []);
        const checks = [
            { desc: "marker", want: MARKER },
            { desc: "header", want: "## 🔄 Action Pin Diff" },
            {
                desc: "action link",
                want: "[`docker/setup-buildx-action`](https://github.com/docker/setup-buildx-action)",
            },
            { desc: "version range", want: "`v3` → `v4.0.0`" },
            { desc: "commit count", want: "**3 commits**" },
            {
                desc: "compare link",
                want: `[Compare](https://github.com/docker/setup-buildx-action/compare/v3...${sha})`,
            },
            {
                desc: "commit row",
                want: "| [`4d04d5d`](https://github.com/docker/setup-buildx-action/commit/4d04d5d9486b7bd6fa91e7baf45bbb4f8b9deedd) | Merge pull request #123 from docker/v4 | 2025-03-20 |",
            },
            {
                desc: "commit row 2",
                want: "| [`abcdef1`](https://github.com/docker/setup-buildx-action/commit/abcdef1234567890abcdef1234567890abcdef12) | chore: bump buildx to 0.20 | 2025-03-19 |",
            },
            {
                desc: "commit row 3",
                want: "| [`1234567`](https://github.com/docker/setup-buildx-action/commit/1234567890abcdef1234567890abcdef12345678) | feat: add support for new driver options | 2025-03-18 |",
            },
        ];
        for (const c of checks) {
            assert.ok(got.includes(c.want), `missing ${c.desc}: ${c.want}`);
        }
    });
});
//# sourceMappingURL=moby.test.js.map