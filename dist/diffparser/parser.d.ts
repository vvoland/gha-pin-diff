/** Represents a single action whose version ref changed. */
export interface ActionUpdate {
    action: string;
    oldRef: string;
    newRef: string;
    oldTag: string;
    newTag: string;
    file: string;
    repo?: string;
}
/** Reports whether s is a 40-character hexadecimal string. */
export declare function isSHA(s: string): boolean;
/**
 * Scans unified diff patches from changed workflow files and returns
 * all detected version changes. Each entry in patches maps a file path to
 * the unified diff patch text (as returned by the GitHub PR files API).
 */
export declare function parse(patches: Record<string, string>): ActionUpdate[];
