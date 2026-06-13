/** Represents a non-OK response from an OCI registry. */
export class RegistryError extends Error {
    method;
    url;
    statusCode;
    constructor(method, url, statusCode, detail = "") {
        const suffix = detail ? `: ${detail}` : "";
        super(`${method} ${url}: status ${statusCode}${suffix}`);
        this.name = "RegistryError";
        this.method = method;
        this.url = url;
        this.statusCode = statusCode;
    }
}
// The implicit registry for unqualified images is Docker Hub, whose public
// distribution API is served from registry-1.docker.io (not docker.io).
const DOCKER_REGISTRY = "registry-1.docker.io";
/**
 * Splits a Docker image name into its registry host and repository, applying
 * Docker Hub's defaults: an unqualified name resolves to registry-1.docker.io
 * and an unnamespaced repository gets the implicit `library/` prefix.
 */
export function splitImageName(name) {
    let registry = DOCKER_REGISTRY;
    let repository = name;
    const slash = name.indexOf("/");
    if (slash >= 0) {
        const head = name.substring(0, slash);
        // A leading segment with a dot, a port, or "localhost" is a registry host;
        // otherwise the whole name is a Docker Hub repository (e.g. "grafana/loki").
        if (head.includes(".") || head.includes(":") || head === "localhost") {
            registry = head === "docker.io" ? DOCKER_REGISTRY : head;
            repository = name.substring(slash + 1);
        }
    }
    if (registry === DOCKER_REGISTRY && !repository.includes("/")) {
        repository = `library/${repository}`;
    }
    return { registry, repository };
}
// Accept every manifest media type so the registry returns the same object the
// tag points at: for multi-arch images that is the index, whose digest is what
// Compose pins, not a per-platform manifest's.
const MANIFEST_ACCEPT = [
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");
/** Minimal OCI distribution client that resolves a tag to its content digest. */
export class RegistryClient {
    endpoints = new Map();
    /** Overrides the base URL used for a registry host (useful for testing). */
    setEndpoint(registry, baseURL) {
        this.endpoints.set(registry, baseURL.replace(/\/+$/, ""));
    }
    /**
     * Resolves the digest that tag currently points to for the given image,
     * performing the registry's anonymous Bearer-token handshake when required.
     * The returned value is the `Docker-Content-Digest` of the manifest the tag
     * resolves to, e.g. "sha256:...".
     */
    async resolveDigest(name, tag) {
        const { registry, repository } = splitImageName(name);
        const base = this.endpoints.get(registry) ?? `https://${registry}`;
        const url = `${base}/v2/${repository}/manifests/${encodeURIComponent(tag)}`;
        let resp = await this.head(url);
        if (resp.status === 401) {
            const token = await this.authenticate(resp.headers.get("www-authenticate"), repository);
            resp = await this.head(url, token);
        }
        if (resp.status !== 200) {
            throw new RegistryError("HEAD", url, resp.status);
        }
        const digest = resp.headers.get("docker-content-digest");
        if (!digest) {
            throw new RegistryError("HEAD", url, resp.status, "no content digest");
        }
        return digest;
    }
    head(url, token) {
        const headers = { Accept: MANIFEST_ACCEPT };
        if (token)
            headers["Authorization"] = `Bearer ${token}`;
        return fetch(url, { method: "HEAD", headers });
    }
    /**
     * Performs the token handshake described by a `WWW-Authenticate: Bearer`
     * challenge and returns the access token. Falls back to a pull scope for the
     * repository when the challenge omits one.
     */
    async authenticate(challenge, repository) {
        if (!challenge)
            throw new Error("missing WWW-Authenticate challenge");
        const params = parseChallenge(challenge);
        const realm = params.get("realm");
        if (!realm)
            throw new Error("WWW-Authenticate challenge has no realm");
        const u = new URL(realm);
        const service = params.get("service");
        if (service)
            u.searchParams.set("service", service);
        u.searchParams.set("scope", params.get("scope") ?? `repository:${repository}:pull`);
        const resp = await fetch(u, { headers: { Accept: "application/json" } });
        if (resp.status !== 200) {
            throw new RegistryError("GET", u.toString(), resp.status);
        }
        const data = (await resp.json());
        const token = data.token ?? data.access_token;
        if (!token)
            throw new Error("token endpoint returned no token");
        return token;
    }
}
/** Parses the key="value" parameters of a Bearer WWW-Authenticate challenge. */
function parseChallenge(challenge) {
    const params = new Map();
    const scheme = challenge.replace(/^\s*Bearer\s+/i, "");
    for (const m of scheme.matchAll(/([a-zA-Z0-9_]+)="([^"]*)"/g)) {
        params.set(m[1], m[2]);
    }
    return params;
}
//# sourceMappingURL=client.js.map