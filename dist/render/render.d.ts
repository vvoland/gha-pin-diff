import type { Result } from "../compare/compare.js";
import type { Mismatch } from "../pinverify/verify.js";
/** HTML comment used to identify bot comments. */
export declare const MARKER = "<!-- gha-pin-diff -->";
/** Maximum number of commits displayed per action. */
export declare const MAX_COMMITS_SHOWN = 15;
/**
 * Renders the full Markdown comment body for the given comparison results.
 * Returns empty string if there are no results and no mismatches.
 */
export declare function comment(results: Result[], mismatches: Mismatch[]): string;
