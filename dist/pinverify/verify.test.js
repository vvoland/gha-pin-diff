import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { check } from "./verify.js";
import { Client } from "../github/client.js";
const sha40a = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const sha40b = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const sha40c = "cccccccccccccccccccccccccccccccccccccccc";
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
describe("check", () => {
    it("no mismatch when SHA matches tag", async () => {
        const { url, close } = await startServer((req, res) => {
            if (req.url?.includes("/repos/actions/checkout/commits/v6.2.0")) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ sha: sha40a }));
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
                    oldRef: "v6",
                    newRef: sha40a,
                    oldTag: "v6",
                    newTag: "v6.2.0",
                    file: ".github/workflows/ci.yml",
                },
            ];
            const mismatches = await check(client, updates);
            assert.equal(mismatches.length, 0);
        }
        finally {
            close();
        }
    });
    it("detects mismatch", async () => {
        const { url, close } = await startServer((req, res) => {
            if (req.url?.includes("/repos/actions/checkout/commits/v6.2.0")) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ sha: sha40b }));
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
                    oldRef: "v6",
                    newRef: sha40a,
                    oldTag: "v6",
                    newTag: "v6.2.0",
                    file: ".github/workflows/ci.yml",
                },
            ];
            const mismatches = await check(client, updates);
            assert.equal(mismatches.length, 1);
            assert.equal(mismatches[0].tag, "v6.2.0");
            assert.equal(mismatches[0].expectSHA, sha40b);
            assert.equal(mismatches[0].update.newRef, sha40a);
        }
        finally {
            close();
        }
    });
    it("skips non-SHA ref", async () => {
        const { url, close } = await startServer((_req, res) => {
            res.writeHead(404);
            res.end();
        });
        try {
            const client = new Client("");
            client.setBaseURL(url);
            const updates = [
                {
                    action: "actions/checkout",
                    oldRef: "v4.0.0",
                    newRef: "v4.1.0",
                    oldTag: "v4.0.0",
                    newTag: "v4.1.0",
                    file: ".github/workflows/ci.yml",
                },
            ];
            const mismatches = await check(client, updates);
            assert.equal(mismatches.length, 0);
        }
        finally {
            close();
        }
    });
    it("skips when no tag", async () => {
        const { url, close } = await startServer((_req, res) => {
            res.writeHead(404);
            res.end();
        });
        try {
            const client = new Client("");
            client.setBaseURL(url);
            const updates = [
                {
                    action: "actions/checkout",
                    oldRef: sha40a,
                    newRef: sha40b,
                    oldTag: "",
                    newTag: "",
                    file: ".github/workflows/ci.yml",
                },
            ];
            const mismatches = await check(client, updates);
            assert.equal(mismatches.length, 0);
        }
        finally {
            close();
        }
    });
    it("deduplicates API calls", async () => {
        let calls = 0;
        const { url, close } = await startServer((req, res) => {
            if (req.url?.includes("/repos/actions/checkout/commits/v6.2.0")) {
                calls++;
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ sha: sha40a }));
                return;
            }
            res.writeHead(404);
            res.end();
        });
        try {
            const client = new Client("");
            client.setBaseURL(url);
            const updates = [
                { action: "actions/checkout", oldRef: "", newRef: sha40a, oldTag: "", newTag: "v6.2.0", file: ".github/workflows/ci.yml" },
                { action: "actions/checkout", oldRef: "", newRef: sha40a, oldTag: "", newTag: "v6.2.0", file: ".github/workflows/build.yml" },
                { action: "actions/checkout", oldRef: "", newRef: sha40a, oldTag: "", newTag: "v6.2.0", file: ".github/workflows/test.yml" },
            ];
            const mismatches = await check(client, updates);
            assert.equal(mismatches.length, 0);
            assert.equal(calls, 1);
        }
        finally {
            close();
        }
    });
    it("handles multiple actions", async () => {
        const { url, close } = await startServer((req, res) => {
            if (req.url?.includes("/repos/actions/checkout/commits/v6.2.0")) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ sha: sha40a }));
                return;
            }
            if (req.url?.includes("/repos/actions/setup-go/commits/v5.1.0")) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ sha: sha40c }));
                return;
            }
            res.writeHead(404);
            res.end();
        });
        try {
            const client = new Client("");
            client.setBaseURL(url);
            const updates = [
                { action: "actions/checkout", oldRef: "", newRef: sha40a, oldTag: "", newTag: "v6.2.0", file: ".github/workflows/ci.yml" },
                { action: "actions/setup-go", oldRef: "", newRef: sha40b, oldTag: "", newTag: "v5.1.0", file: ".github/workflows/ci.yml" },
            ];
            const mismatches = await check(client, updates);
            assert.equal(mismatches.length, 1);
            assert.equal(mismatches[0].update.action, "actions/setup-go");
        }
        finally {
            close();
        }
    });
    it("gracefully handles API errors", async () => {
        const { url, close } = await startServer((_req, res) => {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Not Found" }));
        });
        try {
            const client = new Client("");
            client.setBaseURL(url);
            const updates = [
                { action: "actions/checkout", oldRef: "", newRef: sha40a, oldTag: "", newTag: "v99.0.0", file: ".github/workflows/ci.yml" },
            ];
            const mismatches = await check(client, updates);
            assert.equal(mismatches.length, 0);
        }
        finally {
            close();
        }
    });
});
//# sourceMappingURL=verify.test.js.map