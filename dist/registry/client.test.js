import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { RegistryClient, splitImageName } from "./client.js";
const digestA = "sha256:" + "a".repeat(64);
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
describe("splitImageName", () => {
    const cases = [
        { name: "nginx", registry: "registry-1.docker.io", repository: "library/nginx" },
        { name: "grafana/loki", registry: "registry-1.docker.io", repository: "grafana/loki" },
        { name: "docker.io/library/redis", registry: "registry-1.docker.io", repository: "library/redis" },
        { name: "ghcr.io/owner/repo", registry: "ghcr.io", repository: "owner/repo" },
        { name: "registry:5000/team/app", registry: "registry:5000", repository: "team/app" },
        { name: "localhost/app", registry: "localhost", repository: "app" },
    ];
    for (const c of cases) {
        it(`splits ${c.name}`, () => {
            assert.deepEqual(splitImageName(c.name), {
                registry: c.registry,
                repository: c.repository,
            });
        });
    }
});
describe("RegistryClient.resolveDigest", () => {
    it("performs the bearer-token handshake and returns the digest", async () => {
        let tokenIssued = false;
        const { url, close } = await startServer((req, res) => {
            if (req.url?.startsWith("/token")) {
                tokenIssued = true;
                // The challenge must carry the repository scope through to the token.
                assert.ok(req.url.includes("scope=repository%3Alibrary%2Fnginx%3Apull"));
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ token: "secret" }));
                return;
            }
            if (req.url === "/v2/library/nginx/manifests/1.27") {
                if (req.headers.authorization !== "Bearer secret") {
                    res.writeHead(401, {
                        "WWW-Authenticate": `Bearer realm="${url}/token",service="registry.docker.io",scope="repository:library/nginx:pull"`,
                    });
                    res.end();
                    return;
                }
                res.writeHead(200, { "Docker-Content-Digest": digestA });
                res.end();
                return;
            }
            res.writeHead(404);
            res.end();
        });
        try {
            const client = new RegistryClient();
            client.setEndpoint("registry-1.docker.io", url);
            const digest = await client.resolveDigest("nginx", "1.27");
            assert.equal(digest, digestA);
            assert.ok(tokenIssued, "token endpoint should have been called");
        }
        finally {
            close();
        }
    });
    it("resolves without auth when the registry allows it", async () => {
        const { url, close } = await startServer((req, res) => {
            if (req.url === "/v2/owner/repo/manifests/v2") {
                res.writeHead(200, { "Docker-Content-Digest": digestA });
                res.end();
                return;
            }
            res.writeHead(404);
            res.end();
        });
        try {
            const client = new RegistryClient();
            client.setEndpoint("ghcr.io", url);
            const digest = await client.resolveDigest("ghcr.io/owner/repo", "v2");
            assert.equal(digest, digestA);
        }
        finally {
            close();
        }
    });
    it("throws when the tag is missing", async () => {
        const { url, close } = await startServer((_req, res) => {
            res.writeHead(404);
            res.end();
        });
        try {
            const client = new RegistryClient();
            client.setEndpoint("registry-1.docker.io", url);
            await assert.rejects(() => client.resolveDigest("nginx", "nope"), /status 404/);
        }
        finally {
            close();
        }
    });
    it("rejects registries on non-public addresses", async () => {
        const client = new RegistryClient();
        for (const image of [
            "127.0.0.1/team/app",
            "[::1]/team/app",
            "[::ffff:127.0.0.1]/team/app",
        ]) {
            await assert.rejects(() => client.resolveDigest(image, "latest"), /non-public address/, image);
        }
    });
    it("does not trust a cross-origin token realm", async () => {
        const { url, close } = await startServer((_req, res) => {
            res.writeHead(401, {
                "WWW-Authenticate": 'Bearer realm="https://169.254.169.254/token",service="registry.example"',
            });
            res.end();
        });
        try {
            const client = new RegistryClient();
            client.setEndpoint("registry.example", url);
            await assert.rejects(() => client.resolveDigest("registry.example/team/app", "latest"), /non-public address/);
        }
        finally {
            close();
        }
    });
    it("does not trust a cross-origin redirect", async () => {
        const { url, close } = await startServer((_req, res) => {
            res.writeHead(307, {
                Location: "https://169.254.169.254/v2/team/app/manifests/latest",
            });
            res.end();
        });
        try {
            const client = new RegistryClient();
            client.setEndpoint("registry.example", url);
            await assert.rejects(() => client.resolveDigest("registry.example/team/app", "latest"), /non-public address/);
        }
        finally {
            close();
        }
    });
    it("times out stalled registry requests", async () => {
        const { url, close } = await startServer(() => { });
        try {
            const client = new RegistryClient(25);
            client.setEndpoint("registry.example", url);
            await assert.rejects(() => client.resolveDigest("registry.example/team/app", "latest"), /abort|timeout/i);
        }
        finally {
            close();
        }
    });
});
//# sourceMappingURL=client.test.js.map