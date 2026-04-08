import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { scan } from "./scanner.js";
import { Client } from "../github/client.js";
import { actionOwnerRepo } from "../compare/compare.js";
/**
 * Resolves each pin's tag to its actual SHA via the GitHub API.
 * Returns only the mismatches.
 */
export async function verifyPins(client, pins) {
    // Deduplicate by action+tag to avoid redundant API calls.
    const resolved = new Map();
    const seen = new Set();
    const promises = [];
    for (const pin of pins) {
        const k = `${pin.action}\0${pin.tag}`;
        if (seen.has(k))
            continue;
        seen.add(k);
        promises.push((async () => {
            const parsed = actionOwnerRepo(pin.action);
            if (!parsed)
                return;
            const [owner, repo] = parsed;
            try {
                const sha = await client.resolveRefSHA(owner, repo, pin.tag);
                resolved.set(k, sha);
            }
            catch (err) {
                console.warn(`warning: could not resolve tag ${pin.tag} for ${pin.action}: ${err}`);
            }
        })());
    }
    await Promise.all(promises);
    const mismatches = [];
    for (const pin of pins) {
        const k = `${pin.action}\0${pin.tag}`;
        const sha = resolved.get(k);
        if (!sha)
            continue;
        if (sha !== pin.sha) {
            mismatches.push({ ...pin, expectSHA: sha });
        }
    }
    return mismatches;
}
function usage() {
    console.error(`Usage: gha-pin-diff local [directory]

Scans workflow files for SHA-pinned GitHub Actions and verifies that
each pin matches its tag comment via the GitHub API.

Arguments:
  directory   Project root containing .github/workflows/ (default: .)

Environment:
  GITHUB_TOKEN   GitHub API token (optional, avoids rate limiting)`);
    process.exit(1);
}
export async function run(args) {
    if (args.length > 1)
        usage();
    const rootDir = resolve(args[0] ?? ".");
    const workflowDir = join(rootDir, ".github", "workflows");
    if (!existsSync(workflowDir)) {
        console.error(`error: ${workflowDir} does not exist`);
        process.exit(1);
    }
    const token = process.env.GITHUB_TOKEN ?? "";
    const client = new Client(token);
    const pins = scan(workflowDir, rootDir);
    if (pins.length === 0) {
        console.log("no SHA-pinned actions with tag comments found");
        return;
    }
    console.log(`found ${pins.length} SHA-pinned action(s) with tag comments`);
    const mismatches = await verifyPins(client, pins);
    if (mismatches.length === 0) {
        console.log("✅ all pins match their tag comments");
        return;
    }
    console.log("");
    console.log(`❌ ${mismatches.length} mismatch(es) found:\n`);
    for (const m of mismatches) {
        console.log(`  ${m.file}:${m.line}: ${m.action} pinned to ${m.sha.substring(0, 7)} but ${m.tag} resolves to ${m.expectSHA.substring(0, 7)}`);
    }
    console.log("");
    process.exit(1);
}
//# sourceMappingURL=local.js.map