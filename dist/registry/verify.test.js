import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { check } from "./verify.js";
import { RegistryClient } from "./client.js";
const digestA = "sha256:" + "a".repeat(64);
const digestB = "sha256:" + "b".repeat(64);
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
// resolvesTo serves a public (no-auth) registry that maps every tag to digest.
function resolvesTo(digest) {
    return (req, res) => {
        if (req.url?.startsWith("/v2/") && req.url.includes("/manifests/")) {
            res.writeHead(200, { "Docker-Content-Digest": digest });
            res.end();
            return;
        }
        res.writeHead(404);
        res.end();
    };
}
function imageUpdate(over = {}) {
    return {
        action: "ghcr.io/owner/app",
        oldRef: "1.0",
        newRef: "1.1",
        oldTag: "1.0",
        newTag: "1.1",
        oldDigest: digestA,
        newDigest: digestB,
        file: "compose.yaml",
        homeURL: "https://github.com/owner/app",
        repo: "owner/app",
        ...over,
    };
}
function clientFor(url) {
    const client = new RegistryClient();
    client.setEndpoint("ghcr.io", url);
    return client;
}
describe("check", () => {
    it("no mismatch when the tag resolves to the pinned digest", async () => {
        const { url, close } = await startServer(resolvesTo(digestB));
        try {
            const mismatches = await check(clientFor(url), [imageUpdate()]);
            assert.equal(mismatches.length, 0);
        }
        finally {
            close();
        }
    });
    it("detects a mismatch when the tag moved off the pinned digest", async () => {
        const { url, close } = await startServer(resolvesTo(digestA));
        try {
            const mismatches = await check(clientFor(url), [imageUpdate()]);
            assert.equal(mismatches.length, 1);
            assert.equal(mismatches[0].tag, "1.1");
            assert.equal(mismatches[0].expectDigest, digestA);
            assert.equal(mismatches[0].update.newDigest, digestB);
        }
        finally {
            close();
        }
    });
    it("skips updates without a digest pin", async () => {
        let called = false;
        const { url, close } = await startServer((req, res) => {
            called = true;
            resolvesTo(digestA)(req, res);
        });
        try {
            const mismatches = await check(clientFor(url), [
                imageUpdate({ newDigest: undefined }),
            ]);
            assert.equal(mismatches.length, 0);
            assert.equal(called, false);
        }
        finally {
            close();
        }
    });
    it("deduplicates registry calls for the same image and tag", async () => {
        let calls = 0;
        const { url, close } = await startServer((req, res) => {
            if (req.url?.includes("/manifests/"))
                calls++;
            resolvesTo(digestB)(req, res);
        });
        try {
            const mismatches = await check(clientFor(url), [
                imageUpdate({ file: "compose.yaml" }),
                imageUpdate({ file: "compose.prod.yaml" }),
            ]);
            assert.equal(mismatches.length, 0);
            assert.equal(calls, 1);
        }
        finally {
            close();
        }
    });
    it("does not report a mismatch when the registry is unreachable", async () => {
        const { url, close } = await startServer((_req, res) => {
            res.writeHead(500);
            res.end();
        });
        try {
            const mismatches = await check(clientFor(url), [imageUpdate()]);
            assert.equal(mismatches.length, 0);
        }
        finally {
            close();
        }
    });
});
//# sourceMappingURL=verify.test.js.map