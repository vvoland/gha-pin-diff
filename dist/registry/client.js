import { lookup } from "node:dns/promises";
import { request as httpRequest, } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
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
const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const blockedAddresses = new BlockList();
for (const [address, prefix] of [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
]) {
    blockedAddresses.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of [
    ["::", 128],
    ["::1", 128],
    ["64:ff9b:1::", 48],
    ["100::", 64],
    ["2001::", 23],
    ["2001:db8::", 32],
    ["2002::", 16],
    ["fc00::", 7],
    ["fe80::", 10],
    ["fec0::", 10],
    ["ff00::", 8],
]) {
    blockedAddresses.addSubnet(address, prefix, "ipv6");
}
/** Minimal OCI distribution client that resolves a tag to its content digest. */
export class RegistryClient {
    requestTimeoutMS;
    endpoints = new Map();
    constructor(requestTimeoutMS = DEFAULT_REQUEST_TIMEOUT_MS) {
        this.requestTimeoutMS = requestTimeoutMS;
    }
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
        const endpoint = this.endpoints.get(registry);
        const base = endpoint ?? `https://${registry}`;
        const trustedOrigin = endpoint ? new URL(endpoint).origin : undefined;
        const repositoryPath = repository
            .split("/")
            .map(encodeURIComponent)
            .join("/");
        const url = `${base}/v2/${repositoryPath}/manifests/${encodeURIComponent(tag)}`;
        let resp = await this.head(url, undefined, trustedOrigin);
        if (resp.status === 401) {
            const token = await this.authenticate(header(resp.headers, "www-authenticate"), repository, trustedOrigin);
            resp = await this.head(url, token, trustedOrigin);
        }
        if (resp.status !== 200) {
            throw new RegistryError("HEAD", url, resp.status);
        }
        const digest = header(resp.headers, "docker-content-digest");
        if (!digest) {
            throw new RegistryError("HEAD", url, resp.status, "no content digest");
        }
        return digest;
    }
    head(url, token, trustedOrigin) {
        const headers = { Accept: MANIFEST_ACCEPT };
        if (token)
            headers["Authorization"] = `Bearer ${token}`;
        return this.request("HEAD", url, headers, trustedOrigin);
    }
    /**
     * Performs the token handshake described by a `WWW-Authenticate: Bearer`
     * challenge and returns the access token. Falls back to a pull scope for the
     * repository when the challenge omits one.
     */
    async authenticate(challenge, repository, trustedOrigin) {
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
        const resp = await this.request("GET", u.toString(), { Accept: "application/json" }, trustedOrigin);
        if (resp.status !== 200) {
            throw new RegistryError("GET", u.toString(), resp.status);
        }
        const data = JSON.parse(resp.body);
        const token = data.token ?? data.access_token;
        if (!token)
            throw new Error("token endpoint returned no token");
        return token;
    }
    async request(method, url, headers, trustedOrigin, redirects = 0) {
        const target = new URL(url);
        const trusted = target.origin === trustedOrigin;
        if (target.protocol !== "https:" && !(trusted && target.protocol === "http:")) {
            throw new Error(`registry request must use HTTPS: ${target.toString()}`);
        }
        const addresses = trusted
            ? undefined
            : await resolvePublicAddresses(target.hostname);
        const request = target.protocol === "https:" ? httpsRequest : httpRequest;
        return new Promise((resolve, reject) => {
            const req = request(target, {
                method,
                headers,
                lookup: addresses ? fixedLookup(addresses) : undefined,
                signal: AbortSignal.timeout(this.requestTimeoutMS),
            }, (resp) => {
                const status = resp.statusCode ?? 0;
                const location = header(resp.headers, "location");
                if (location &&
                    [301, 302, 303, 307, 308].includes(status)) {
                    resp.resume();
                    if (redirects >= MAX_REDIRECTS) {
                        reject(new Error(`too many registry redirects for ${url}`));
                        return;
                    }
                    const next = new URL(location, target);
                    const nextHeaders = { ...headers };
                    if (next.origin !== target.origin) {
                        delete nextHeaders.Authorization;
                    }
                    resolve(this.request(method, next.toString(), nextHeaders, trustedOrigin, redirects + 1));
                    return;
                }
                let body = "";
                let size = 0;
                resp.setEncoding("utf8");
                resp.on("data", (chunk) => {
                    size += Buffer.byteLength(chunk);
                    if (size > MAX_RESPONSE_BYTES) {
                        resp.destroy(new Error(`registry response exceeds ${MAX_RESPONSE_BYTES} bytes`));
                        return;
                    }
                    body += chunk;
                });
                resp.on("end", () => resolve({ status, headers: resp.headers, body }));
                resp.on("error", reject);
            });
            req.on("error", reject);
            req.end();
        });
    }
}
function header(headers, name) {
    const value = headers[name];
    if (Array.isArray(value))
        return value[0] ?? null;
    return value ?? null;
}
async function resolvePublicAddresses(hostname) {
    const host = hostname.startsWith("[") && hostname.endsWith("]")
        ? hostname.substring(1, hostname.length - 1)
        : hostname;
    const family = isIP(host);
    const addresses = family
        ? [{ address: host, family }]
        : await lookup(host, { all: true, verbatim: true });
    if (addresses.length === 0) {
        throw new Error(`registry host has no addresses: ${hostname}`);
    }
    for (const address of addresses) {
        const type = address.family === 6 ? "ipv6" : "ipv4";
        if (blockedAddresses.check(address.address, type)) {
            throw new Error(`registry host resolves to a non-public address: ${address.address}`);
        }
    }
    return addresses;
}
function fixedLookup(addresses) {
    return (_hostname, options, callback) => {
        const family = options.family;
        const compatible = family
            ? addresses.filter((address) => address.family === family)
            : addresses;
        if (compatible.length === 0) {
            const err = new Error("registry host has no address for requested family");
            callback(err, "", 0);
            return;
        }
        if (options.all) {
            callback(null, compatible);
            return;
        }
        callback(null, compatible[0].address, compatible[0].family);
    };
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