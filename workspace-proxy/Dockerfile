FROM golang:1.22-alpine AS builder

WORKDIR /src
RUN apk add --no-cache ca-certificates tzdata

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/workspace-proxy ./cmd/proxy

FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /out/workspace-proxy /app/workspace-proxy

USER nobody:nobody
EXPOSE 8080
ENTRYPOINT ["/app/workspace-proxy"]
