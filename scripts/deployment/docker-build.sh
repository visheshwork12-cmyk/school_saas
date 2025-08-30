#!/bin/bash
# Build script for Docker images

set -e

ENVIRONMENT=${1:-development}
VERSION=${2:-latest}
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
COMMIT_SHA=$(git rev-parse HEAD)

echo "🔨 Building Docker image for environment: $ENVIRONMENT"

case $ENVIRONMENT in
  "development")
    docker build \
      -f docker/Dockerfile.dev \
      --build-arg NODE_ENV=development \
      --build-arg BUILD_DATE=$BUILD_DATE \
      --build-arg VERSION=$VERSION \
      -t school-erp:dev-$VERSION \
      .
    ;;
  "production")
    docker build \
      -f docker/Dockerfile.prod \
      --build-arg NODE_ENV=production \
      --build-arg BUILD_DATE=$BUILD_DATE \
      --build-arg VERSION=$VERSION \
      --build-arg COMMIT_SHA=$COMMIT_SHA \
      -t school-erp:$VERSION \
      .
    ;;
  *)
    docker build \
      -f docker/Dockerfile \
      --build-arg NODE_ENV=$ENVIRONMENT \
      --build-arg BUILD_DATE=$BUILD_DATE \
      --build-arg VERSION=$VERSION \
      -t school-erp:$VERSION \
      .
    ;;
esac

echo "✅ Docker image built successfully: school-erp:$VERSION"
