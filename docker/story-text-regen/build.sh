#!/bin/bash

# Build script for Lambda Docker image
# Usage: ./build.sh [tag]

set -e

TAG=${1:-latest}
REPO_NAME="aws-hackathon-2025-lambda"
REGION="us-east-1"

echo "Building Docker image for Lambda..."
docker build --platform linux/amd64 -t ${REPO_NAME}:${TAG} .

echo "Docker image built successfully: ${REPO_NAME}:${TAG}"
echo ""
echo "To push to ECR, run:"
echo "1. aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin <account-id>.dkr.ecr.${REGION}.amazonaws.com"
echo "2. docker tag ${REPO_NAME}:${TAG} <account-id>.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}:${TAG}"
echo "3. docker push <account-id>.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}:${TAG}"
