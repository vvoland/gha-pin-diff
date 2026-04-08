import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { verifyPins } from "./local.js";
import { Client } from "../github/client.js";
import type { Pin } from "./scanner.js";

function mockServer(
  responses: Record<string, { status: number; body: string }>
): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const r = responses[req.url ?? ""];
      if (r) {
        res.writeHead(r.status, { "Content-Type": "application/json" });
        res.end(r.body);
      } else {
        res.writeHead(404);
        res.end('{"message":"Not Found"}');
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => server.close(),
      });
    });
  });
}

describe("verifyPins", () => {
  it("returns empty for matching pins", async () => {
    const sha = "de0fac2e4500dabe0009e67214ff5f5447ce83dd";
    const { url, close } = await mockServer({
      "/repos/actions/checkout/commits/v6.0.1": {
        status: 200,
        body: JSON.stringify({ sha }),
      },
    });
    try {
      const client = new Client("");
      client.setBaseURL(url);

      const pins: Pin[] = [
        {
          action: "actions/checkout",
          sha,
          tag: "v6.0.1",
          file: ".github/workflows/ci.yml",
          line: 7,
        },
      ];

      const mismatches = await verifyPins(client, pins);
      assert.equal(mismatches.length, 0);
    } finally {
      close();
    }
  });

  it("detects mismatches", async () => {
    const pinnedSHA = "de0fac2e4500dabe0009e67214ff5f5447ce83dd";
    const actualSHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const { url, close } = await mockServer({
      "/repos/actions/checkout/commits/v6.0.1": {
        status: 200,
        body: JSON.stringify({ sha: actualSHA }),
      },
    });
    try {
      const client = new Client("");
      client.setBaseURL(url);

      const pins: Pin[] = [
        {
          action: "actions/checkout",
          sha: pinnedSHA,
          tag: "v6.0.1",
          file: ".github/workflows/ci.yml",
          line: 7,
        },
      ];

      const mismatches = await verifyPins(client, pins);
      assert.equal(mismatches.length, 1);
      assert.equal(mismatches[0].expectSHA, actualSHA);
      assert.equal(mismatches[0].sha, pinnedSHA);
      assert.equal(mismatches[0].tag, "v6.0.1");
    } finally {
      close();
    }
  });

  it("deduplicates API calls for same action+tag", async () => {
    const sha = "de0fac2e4500dabe0009e67214ff5f5447ce83dd";
    let callCount = 0;
    const server = createServer((req, res) => {
      callCount++;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sha }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    const addr = server.address() as { port: number };
    try {
      const client = new Client("");
      client.setBaseURL(`http://127.0.0.1:${addr.port}`);

      const pins: Pin[] = [
        {
          action: "actions/checkout",
          sha,
          tag: "v6.0.1",
          file: ".github/workflows/ci.yml",
          line: 7,
        },
        {
          action: "actions/checkout",
          sha,
          tag: "v6.0.1",
          file: ".github/workflows/build.yml",
          line: 12,
        },
      ];

      await verifyPins(client, pins);
      assert.equal(callCount, 1);
    } finally {
      server.close();
    }
  });
});
