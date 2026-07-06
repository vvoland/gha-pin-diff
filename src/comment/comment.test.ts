import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { ensure, ensureIfAllowed, isCommentPermissionError } from "./comment.js";
import { APIError, Client } from "../github/client.js";
import { MARKER } from "../render/render.js";

function startServer(
  handler: (req: any, res: any) => void
): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => server.close(),
      });
    });
  });
}

describe("ensure", () => {
  it("creates comment when none exists", async () => {
    let created = false;
    const { url, close } = await startServer((req, res) => {
      if (
        req.url === "/repos/o/r/issues/1/comments?per_page=100&page=1" &&
        req.method === "GET"
      ) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("[]");
        return;
      }
      if (
        req.url === "/repos/o/r/issues/1/comments" &&
        req.method === "POST"
      ) {
        created = true;
        res.writeHead(201);
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });

    try {
      const client = new Client("");
      client.setBaseURL(url);
      await ensure(client, "o", "r", 1, "new body");
      assert.ok(created, "expected comment to be created");
    } finally {
      close();
    }
  });

  it("updates existing comment", async () => {
    let updated = false;
    const { url, close } = await startServer((req, res) => {
      if (
        req.url === "/repos/o/r/issues/1/comments?per_page=100&page=1" &&
        req.method === "GET"
      ) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify([
            { id: 42, body: "old " + MARKER, user: { login: "bot" } },
          ])
        );
        return;
      }
      if (req.url === "/repos/o/r/issues/comments/42" && req.method === "PATCH") {
        updated = true;
        res.writeHead(200);
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });

    try {
      const client = new Client("");
      client.setBaseURL(url);
      await ensure(client, "o", "r", 1, "updated body");
      assert.ok(updated, "expected comment to be updated");
    } finally {
      close();
    }
  });

  it("deletes when empty", async () => {
    let deleted = false;
    const { url, close } = await startServer((req, res) => {
      if (
        req.url === "/repos/o/r/issues/1/comments?per_page=100&page=1" &&
        req.method === "GET"
      ) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify([
            { id: 42, body: "old " + MARKER, user: { login: "bot" } },
          ])
        );
        return;
      }
      if (
        req.url === "/repos/o/r/issues/comments/42" &&
        req.method === "DELETE"
      ) {
        deleted = true;
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });

    try {
      const client = new Client("");
      client.setBaseURL(url);
      await ensure(client, "o", "r", 1, "");
      assert.ok(deleted, "expected comment to be deleted when body is empty");
    } finally {
      close();
    }
  });

  it("no-op when empty and no existing comment", async () => {
    const { url, close } = await startServer((req, res) => {
      if (
        req.url === "/repos/o/r/issues/1/comments?per_page=100&page=1" &&
        req.method === "GET"
      ) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("[]");
        return;
      }
      res.writeHead(404);
      res.end();
    });

    try {
      const client = new Client("");
      client.setBaseURL(url);
      await ensure(client, "o", "r", 1, "");
    } finally {
      close();
    }
  });

  it("surfaces APIError when comment creation is forbidden", async () => {
    const { url, close } = await startServer((req, res) => {
      if (
        req.url === "/repos/o/r/issues/1/comments?per_page=100&page=1" &&
        req.method === "GET"
      ) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("[]");
        return;
      }
      if (
        req.url === "/repos/o/r/issues/1/comments" &&
        req.method === "POST"
      ) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ message: "Resource not accessible by integration" })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });

    try {
      const client = new Client("");
      client.setBaseURL(url);
      await assert.rejects(
        ensure(client, "o", "r", 1, "new body"),
        (err: unknown) => {
          assert.ok(err instanceof APIError);
          assert.equal(err.statusCode, 403);
          return true;
        }
      );
    } finally {
      close();
    }
  });

  it("recognizes issue comment permission denials", () => {
    const body = JSON.stringify({
      message: "Resource not accessible by integration",
    });

    for (const url of [
      "https://api.github.com/repos/o/r/issues/1/comments",
      "https://api.github.com/repos/o/r/issues/1/comments?per_page=100&page=1",
      "https://api.github.com/repos/o/r/issues/comments/42",
    ]) {
      assert.equal(
        isCommentPermissionError(new APIError("POST", url, 403, body)),
        true,
        url
      );
    }
  });

  it("warns instead of failing when comments are forbidden", async () => {
    const { url, close } = await startServer((req, res) => {
      if (
        req.url === "/repos/o/r/issues/1/comments?per_page=100&page=1" &&
        req.method === "GET"
      ) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("[]");
        return;
      }
      if (
        req.url === "/repos/o/r/issues/1/comments" &&
        req.method === "POST"
      ) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ message: "Resource not accessible by integration" })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...data: any[]) => {
      logs.push(data.join(" "));
    };

    try {
      const client = new Client("");
      client.setBaseURL(url);
      await ensureIfAllowed(client, "o", "r", 1, "new body");
      assert.equal(logs.length, 1);
      assert.match(logs[0], /^::warning::unable to post PR comment/);
    } finally {
      console.log = originalLog;
      close();
    }
  });
});
