import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scanContent } from "./scanner.js";
describe("scanContent", () => {
    it("extracts SHA-pinned action with tag comment", () => {
        const content = `name: CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.1
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
`;
        const pins = scanContent(content, ".github/workflows/ci.yml");
        assert.equal(pins.length, 2);
        assert.deepStrictEqual(pins[0], {
            action: "actions/checkout",
            sha: "de0fac2e4500dabe0009e67214ff5f5447ce83dd",
            tag: "v6.0.1",
            file: ".github/workflows/ci.yml",
            line: 7,
        });
        assert.deepStrictEqual(pins[1], {
            action: "actions/setup-node",
            sha: "49933ea5288caeca8642d1e84afbd3f7d6820020",
            tag: "v4.4.0",
            file: ".github/workflows/ci.yml",
            line: 8,
        });
    });
    it("ignores tag-only refs (not SHA-pinned)", () => {
        const content = `    - uses: actions/checkout@v4`;
        const pins = scanContent(content, "test.yml");
        assert.equal(pins.length, 0);
    });
    it("ignores SHA pins without tag comments", () => {
        const content = `    - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd`;
        const pins = scanContent(content, "test.yml");
        assert.equal(pins.length, 0);
    });
    it("ignores non-uses lines", () => {
        const content = `    - run: echo hello`;
        const pins = scanContent(content, "test.yml");
        assert.equal(pins.length, 0);
    });
    it("handles actions with path (e.g. owner/repo/path)", () => {
        const content = `    - uses: aws-actions/configure-aws-credentials/path@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v4`;
        const pins = scanContent(content, "test.yml");
        assert.equal(pins.length, 1);
        assert.equal(pins[0].action, "aws-actions/configure-aws-credentials/path");
        assert.equal(pins[0].tag, "v4");
    });
    it("returns correct line numbers", () => {
        const content = `line1
line2
    - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v4
line4
    - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
`;
        const pins = scanContent(content, "test.yml");
        assert.equal(pins.length, 2);
        assert.equal(pins[0].line, 3);
        assert.equal(pins[1].line, 5);
    });
    it("handles tag with extra comment text after it", () => {
        const content = `    - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v4.1.1 some extra comment`;
        const pins = scanContent(content, "test.yml");
        assert.equal(pins.length, 1);
        assert.equal(pins[0].tag, "v4.1.1");
    });
});
//# sourceMappingURL=scanner.test.js.map