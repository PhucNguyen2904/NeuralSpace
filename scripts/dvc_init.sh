#!/bin/bash
# Khoi tao DVC repo va config MinIO remote

set -euo pipefail

REPO_PATH=${1:-"."}
MINIO_ENDPOINT=${MINIO_ENDPOINT:-"http://localhost:9000"}
MINIO_BUCKET=${MINIO_BUCKET:-"dvc-data"}
MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}
MINIO_SECRET_KEY=${MINIO_SECRET_KEY}

cd "$REPO_PATH"

if [ ! -d ".dvc" ]; then
  dvc init
  git add .dvc .gitignore
  git commit -m "chore: initialize DVC"
fi

dvc remote add -d minio "s3://${MINIO_BUCKET}" || true
dvc remote modify minio endpointurl "$MINIO_ENDPOINT"
dvc remote modify minio access_key_id "$MINIO_ACCESS_KEY"
dvc remote modify minio secret_access_key "$MINIO_SECRET_KEY"

dvc config cache.type hardlink,symlink,copy

git add .dvc/config
git commit -m "chore: configure DVC remote (MinIO)" || true

echo "DVC initialized. Remote: ${MINIO_ENDPOINT}/${MINIO_BUCKET}"
