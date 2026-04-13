import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const repoRe = /(["'])([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\1/g;
const nameRe = /name\s*=\s*(["'])([^"']+)\1/;
export function scanPluginRepos(rootDir) {
    const dir = join(rootDir, "lua", "plugins");
    const repos = new Map();
    if (!existsSync(dir))
        return repos;
    for (const file of findLuaFiles(dir)) {
        const content = readFileSync(file, "utf-8");
        collectPluginRepos(content, repos);
    }
    return repos;
}
function collectPluginRepos(content, repos) {
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
function addAlias(repos, alias, repo) {
    if (!alias || repos.has(alias))
        return;
    repos.set(alias, repo);
}
function repoName(repo) {
    const slash = repo.indexOf("/");
    return slash >= 0 ? repo.slice(slash + 1) : repo;
}
function findLuaFiles(dir) {
    const files = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            files.push(...findLuaFiles(full));
        }
        else if (entry.endsWith(".lua")) {
            files.push(full);
        }
    }
    return files;
}
//# sourceMappingURL=plugins.js.map