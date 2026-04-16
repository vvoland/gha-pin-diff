import type { ActionUpdate } from "../diffparser/parser.js";
export declare function scanPluginRepos(rootDir: string): Map<string, string>;
export declare function resolveLazyLockRepos(workspace: string, updates: ActionUpdate[]): ActionUpdate[];
