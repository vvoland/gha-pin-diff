import { describe, expect, it } from "vitest";
import { parse } from "./parser.js";

/**
 * Tests parsing the real diff from moby/moby#52217
 * which pins docker/setup-buildx-action from tag @v3 to SHA @4d04d5d... # v4.0.0
 * across many workflow files.
 */
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
    expect(got).toHaveLength(3);

    for (const u of got) {
      expect(u.action).toBe("docker/setup-buildx-action");
      expect(u.oldRef).toBe("v3");
      expect(u.newRef).toBe(sha);
      expect(u.oldTag).toBe("v3");
      expect(u.newTag).toBe("v4.0.0");
    }
  });
});
