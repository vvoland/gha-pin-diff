/** A SHA-pinned action reference found in a workflow file. */
export interface Pin {
    action: string;
    sha: string;
    tag: string;
    file: string;
    line: number;
}
/** Scans a single file's content for SHA-pinned action references. */
export declare function scanContent(content: string, file: string): Pin[];
/**
 * Scans all workflow files under the given directory for SHA-pinned actions
 * with tag comments. Returns all pins found.
 */
export declare function scan(workflowDir: string, rootDir: string): Pin[];
