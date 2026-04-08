import { type Pin } from "./scanner.js";
import { Client } from "../github/client.js";
export interface VerifiedPin extends Pin {
    expectSHA: string;
}
/**
 * Resolves each pin's tag to its actual SHA via the GitHub API.
 * Returns only the mismatches.
 */
export declare function verifyPins(client: Client, pins: Pin[]): Promise<VerifiedPin[]>;
export declare function run(args: string[]): Promise<void>;
