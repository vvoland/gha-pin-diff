import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveLazyLockRepos, scanPluginRepos } from "./plugins.js";
describe("scanPluginRepos", () => {
    it("maps plugin aliases from lua/plugins", () => {
        const root = mkdtempSync(join(tmpdir(), "gha-pin-diff-"));
        try {
            const dir = join(root, "lua", "plugins");
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, "editor.lua"), `return {
  {
    "ibhagwan/fzf-lua",
    lazy = true,
  },
  {
    "olimorris/codecompanion.nvim",
    name = "codecompanion.nvim",
  },
  {
    "nvim-lualine/lualine.nvim",
  },
}
`);
            const got = scanPluginRepos(root);
            assert.equal(got.get("fzf-lua"), "ibhagwan/fzf-lua");
            assert.equal(got.get("codecompanion.nvim"), "olimorris/codecompanion.nvim");
            assert.equal(got.get("lualine.nvim"), "nvim-lualine/lualine.nvim");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("returns empty when lua/plugins is missing", () => {
        const root = mkdtempSync(join(tmpdir(), "gha-pin-diff-"));
        try {
            const got = scanPluginRepos(root);
            assert.deepEqual([...got.entries()], []);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("resolves lazy-lock aliases relative to the lockfile directory", () => {
        const root = mkdtempSync(join(tmpdir(), "gha-pin-diff-"));
        try {
            const dir = join(root, "neovim", "lua", "plugins");
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, "ui.lua"), `return {
  {
    "nvim-lualine/lualine.nvim",
  },
}
`);
            const got = resolveLazyLockRepos(root, [
                {
                    action: "lualine.nvim",
                    oldRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    newRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    oldTag: "",
                    newTag: "",
                    file: "neovim/lazy-lock.json",
                },
            ]);
            assert.equal(got[0].repo, "nvim-lualine/lualine.nvim");
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
//# sourceMappingURL=plugins.test.js.map