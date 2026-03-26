import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { fetch as compareFetch, actionOwnerRepo } from "./compare.js";
import { Client, APIError } from "../github/client.js";
import type { ActionUpdate } from "../diffparser/parser.js";

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

describe("fetch", () => {
  it("fetches comparison data", async () => {
    const { url, close } = await startServer((req, res) => {
      if (req.url?.startsWith("/repos/actions/checkout/compare/")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            html_url:
              "https://github.com/actions/checkout/compare/aaa...bbb",
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
          })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });

    try {
      const client = new Client("");
      client.setBaseURL(url);

      const updates: ActionUpdate[] = [
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
      expect(results).toHaveLength(1);

      const r = results[0];
      expect(r.err).toBeNull();
      expect(r.totalCommits).toBe(2);
      expect(r.compareURL).toBe(
        "https://github.com/actions/checkout/compare/aaa...bbb"
      );
      expect(r.commits).toHaveLength(2);
      expect(r.commits[0].message).toBe("Fix something");
      expect(r.commits[0].author).toBe("alice");
    } finally {
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

      const updates: ActionUpdate[] = [
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
      expect(results).toHaveLength(1);
      expect(results[0].err).not.toBeNull();
      expect(results[0].err).toBeInstanceOf(APIError);
      expect((results[0].err as APIError).statusCode).toBe(404);
    } finally {
      close();
    }
  });
});

describe("actionOwnerRepo", () => {
  it("parses simple action", () => {
    expect(actionOwnerRepo("actions/checkout")).toEqual(["actions", "checkout"]);
  });

  it("parses reusable workflow", () => {
    expect(
      actionOwnerRepo("org/repo/.github/workflows/deploy.yml")
    ).toEqual(["org", "repo"]);
  });

  it("returns null for invalid input", () => {
    expect(actionOwnerRepo("invalid")).toBeNull();
  });
});
