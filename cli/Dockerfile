# Multi-stage build to optimize image size and build time
# Stage 1: Build the Drasi CLI using official Go image
FROM golang:1.22.5-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Set working directory
WORKDIR /app

# Copy go mod files first for better caching
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the Drasi CLI for Linux
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags "-X drasi.io/cli/config.Version=docker" -o drasi main.go

# Stage 2: Create final image based on Azure Linux 3 (CBL-Mariner 2.0)
FROM mcr.microsoft.com/cbl-mariner/base/core:2.0

# Set environment variable for remote Drasi instance URL
ENV DRASI_REMOTE_URL=""

# Install required packages for runtime
RUN tdnf update -y && \
    tdnf install -y ca-certificates shadow-utils && \
    tdnf clean all

# Copy the built binary from the builder stage
COPY --from=builder /app/drasi /usr/local/bin/drasi

# Make the binary executable
RUN chmod +x /usr/local/bin/drasi

# Create a non-root user for security and set up workspace
RUN useradd -r -u 1000 -m drasi && \
    mkdir -p /workspace && \
    chown drasi:drasi /workspace

# Switch to non-root user
USER drasi

# Set working directory for runtime
WORKDIR /workspace

# Default entrypoint that allows piping YAML to drasi apply
# Usage: echo "yaml content" | docker run -i <image>
# Or: docker run -i <image> < manifest.yaml
ENTRYPOINT ["/bin/sh", "-c", "cat > /tmp/manifest.yaml && /usr/local/bin/drasi apply -f /tmp/manifest.yaml"]