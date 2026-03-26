group "default" {
    targets = ["binary"]
}

target "binary" {
    dockerfile = "Dockerfile"
    context = "."
    target = "binary"
    output = ["type=local,dest=build"]
    attest = [
        { type = "provenance", mode = "max" },
        { type = "sbom" }
    ]
    platforms = ["local"]
}

variable "DIST_PLATFORMS" {
    default = [
        "linux/amd64",
        "linux/arm64",
        "darwin/amd64",
        "darwin/arm64",
        "windows/amd64",
        "windows/arm64",
    ]
}

target "_dist" {
    name = "dist-${replace(item, "/", "-")}"
    matrix = {
        item = DIST_PLATFORMS
    }
    dockerfile = "Dockerfile"
    context = "."
    target = "binary"
    output = ["type=local,dest=dist/${item}"]
    platforms = [item]
}

group "dist" {
    targets = [for p in DIST_PLATFORMS : "dist-${replace(p, "/", "-")}"]
}
