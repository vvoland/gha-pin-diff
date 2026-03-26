import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fetch as compareFetch, actionOwnerRepo } from "./compare.js";
import { Client, APIError } from "../github/client.js";
function startServer(handler) {
    return new Promise((resolve) => {
        const server = createServer(handler);
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address();
            resolve({
                url: `http://127.0.0.1:${addr.port}`,
                close: () => server.close(),
            });
        });
    });
}
describe("fetch", () => {
    it("fetches comparison data", async () => {
        const { url, close } = await startServer((req, res) => {
            if (req.url?.startsWith("/repos/actions/checkout/compare/")) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    html_url: "https://github.com/actions/checkout/compare/aaa...bbb",
                    total_commits: 2,
                    commits: [
                        {
                            sha: "abc1234567890abc1234567890abc1234567890ab",
                            commit: {
                                message: "Fix something\n\nDetails here",
                                author: { name: "Alice", date: "2024-04-15T10:00:00Z" },
                            },
                            author: { login: "alice" },
                        },
                        {
                            sha: "def1234567890def1234567890def1234567890de",
                            commit: {
                                message: "Update deps",
                                author: { name: "Bob", date: "2024-04-14T09:00:00Z" },
                            },
                            author: { login: "bob" },
                        },
                    ],
                }));
                return;
            }
            res.writeHead(404);
            res.end();
        });
        try {
            const client = new Client("");
            client.setBaseURL(url);
            const updates = [
                {
                    action: "actions/checkout",
                    oldRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    newRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    oldTag: "v4.0.0",
                    newTag: "v4.1.0",
                    file: ".github/workflows/ci.yml",
                },
            ];
            const results = await compareFetch(client, updates);
            assert.equal(results.length, 1);
            const r = results[0];
            assert.equal(r.err, null);
            assert.equal(r.totalCommits, 2);
            assert.equal(r.compareURL, "https://github.com/actions/checkout/compare/aaa...bbb");
            assert.equal(r.commits.length, 2);
            assert.equal(r.commits[0].message, "Fix something");
            assert.equal(r.commits[0].author, "alice");
        }
        finally {
            close();
        }
    });
    it("handles API errors", async () => {
        const { url, close } = await startServer((_req, res) => {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Not Found" }));
        });
        try {
            const client = new Client("");
            client.setBaseURL(url);
            const updates = [
                {
                    action: "actions/deleted-action",
                    oldRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    newRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    oldTag: "",
                    newTag: "",
                    file: ".github/workflows/ci.yml",
                },
            ];
            const results = await compareFetch(client, updates);
            assert.equal(results.length, 1);
            assert.notEqual(results[0].err, null);
            assert.ok(results[0].err instanceof APIError);
            assert.equal(results[0].err.statusCode, 404);
        }
        finally {
            close();
        }
    });
});
describe("actionOwnerRepo", () => {
    it("parses simple action", () => {
        assert.deepEqual(actionOwnerRepo("actions/checkout"), ["actions", "checkout"]);
    });
    it("parses reusable workflow", () => {
        assert.deepEqual(actionOwnerRepo("org/repo/.github/workflows/deploy.yml"), ["org", "repo"]);
    });
    it("returns null for invalid input", () => {
        assert.equal(actionOwnerRepo("invalid"), null);
    });
});
//# sourceMappingURL=compare.test.js.map