group "default" {
    targets = ["dist"]
}

target "dist" {
    dockerfile = "Dockerfile"
    context = "."
    target = "dist"
    output = ["type=local,dest=dist"]
}
