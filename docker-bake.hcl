group "default" {
    targets = ["build"]
}

target "build" {
    dockerfile = "Dockerfile"
    context = "."
    target = "dist"
    output = ["type=local,dest=dist"]
}
