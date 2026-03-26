import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parse } from "./parser.js";

describe("moby PR 52217", () => {
  it("parses all workflow file changes", () => {
    const sha = "4d04d5d9486b7bd6fa91e7baf45bbb4f8b9deedd";
    const patches: Record<string, string> = {
      ".github/workflows/.test-unit.yml":
        "@@ -51,7 +51,7 @@ jobs:\n" +
        "       -\n" +
        "         name: Set up Docker Buildx\n" +
        `-        uses: docker/setup-buildx-action@v3\n` +
        `+        uses: docker/setup-buildx-action@${sha} # v4.0.0\n` +
        "         with:",
      ".github/workflows/.test.yml":
        "@@ -48,7 +48,7 @@ jobs:\n" +
        "       -\n" +
        "         name: Set up Docker Buildx\n" +
        `-        uses: docker/setup-buildx-action@v3\n` +
        `+        uses: docker/setup-buildx-action@${sha} # v4.0.0\n` +
        "         with:",
      ".github/workflows/ci.yml":
        "@@ -45,7 +45,7 @@ jobs:\n" +
        "       -\n" +
        "         name: Set up Docker Buildx\n" +
        `-        uses: docker/setup-buildx-action@v3\n` +
        `+        uses: docker/setup-buildx-action@${sha} # v4.0.0\n` +
        "         with:",
    };

    const got = parse(patches);
    assert.equal(got.length, 3);

    for (const u of got) {
      assert.equal(u.action, "docker/setup-buildx-action");
      assert.equal(u.oldRef, "v3");
      assert.equal(u.newRef, sha);
      assert.equal(u.oldTag, "v3");
      assert.equal(u.newTag, "v4.0.0");
    }
  });
});
