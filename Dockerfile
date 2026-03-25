FROM golang:1.26-alpine AS builder
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /gha-pin-diff .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates
COPY --from=builder /gha-pin-diff /gha-pin-diff
ENTRYPOINT ["/gha-pin-diff"]
