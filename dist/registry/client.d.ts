/** Represents a non-OK response from an OCI registry. */
export declare class RegistryError extends Error {
    method: string;
    url: string;
    statusCode: number;
    constructor(method: string, url: string, statusCode: number, detail?: string);
}
/** A Docker image reference split into the registry host and repository path. */
export interface ImageName {
    registry: string;
    repository: string;
}
/**
 * Splits a Docker image name into its registry host and repository, applying
 * Docker Hub's defaults: an unqualified name resolves to registry-1.docker.io
 * and an unnamespaced repository gets the implicit `library/` prefix.
 */
export declare function splitImageName(name: string): ImageName;
/** Minimal OCI distribution client that resolves a tag to its content digest. */
export declare class RegistryClient {
    private endpoints;
    /** Overrides the base URL used for a registry host (useful for testing). */
    setEndpoint(registry: string, baseURL: string): void;
    /**
     * Resolves the digest that tag currently points to for the given image,
     * performing the registry's anonymous Bearer-token handshake when required.
     * The returned value is the `Docker-Content-Digest` of the manifest the tag
     * resolves to, e.g. "sha256:...".
     */
    resolveDigest(name: string, tag: string): Promise<string>;
    private head;
    /**
     * Performs the token handshake described by a `WWW-Authenticate: Bearer`
     * challenge and returns the access token. Falls back to a pull scope for the
     * repository when the challenge omits one.
     */
    private authenticate;
}
