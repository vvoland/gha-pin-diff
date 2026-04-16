import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ActionUpdate } from "../diffparser/parser.js";

const repoRe = /(["'])([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\1/g;
const nameRe = /name\s*=\s*(["'])([^"']+)\1/;

export function scanPluginRepos(rootDir: string): Map<string, string> {
  const dir = join(rootDir, "lua", "plugins");
  const repos = new Map<string, string>();
  if (!existsSync(dir)) return repos;

  for (const file of findLuaFiles(dir)) {
    const content = readFileSync(file, "utf-8");
    collectPluginRepos(content, repos);
  }

  return repos;
}

export function resolveLazyLockRepos(
  workspace: string,
  updates: ActionUpdate[]
): ActionUpdate[] {
  const cache = new Map<string, Map<string, string>>();

  return updates.map((u) => {
    if (!isLazyLockFile(u.file) || u.repo) return u;

    const root = resolve(workspace, dirname(u.file));
    let repos = cache.get(root);
    if (!repos) {
      repos = scanPluginRepos(root);
      cache.set(root, repos);
    }

    const repo = repos.get(u.action);
    return repo ? { ...u, repo } : u;
  });
}

function collectPluginRepos(content: string, repos: Map<string, string>): void {
  const matches = [...content.matchAll(repoRe)];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const repo = match[2];
    addAlias(repos, repoName(repo), repo);

    const start = match.index ?? 0;
    const end = matches[i + 1]?.index ?? Math.min(content.length, start + 400);
    const snippet = content.slice(start, end);
    const named = snippet.match(nameRe);
    if (named) {
      addAlias(repos, named[2], repo);
    }
  }
}

function addAlias(repos: Map<string, string>, alias: string, repo: string): void {
  if (!alias || repos.has(alias)) return;
  repos.set(alias, repo);
}

function repoName(repo: string): string {
  const slash = repo.indexOf("/");
  return slash >= 0 ? repo.slice(slash + 1) : repo;
}

function isLazyLockFile(filePath: string): boolean {
  return filePath === "lazy-lock.json" || filePath.endsWith("/lazy-lock.json");
}

function findLuaFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      files.push(...findLuaFiles(full));
    } else if (entry.endsWith(".lua")) {
      files.push(full);
    }
  }
  return files;
}
