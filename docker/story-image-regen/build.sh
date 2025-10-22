#!/bin/bash

# Exit on error
set -e

# Set AWS environment
export AWS_PROFILE=sandbox
export AWS_REGION=us-east-1

# Configuration
ECR_REPOSITORY="aws-hackathon-2025-story-image-lambda-dev"
AWS_ACCOUNT_ID="008701887645"
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}"

echo "🔨 Building Docker image for story-image-regen Lambda..."
docker buildx build --platform linux/amd64 --output type=docker -t ${ECR_REPOSITORY} .

echo "🏷️  Tagging image..."
docker tag ${ECR_REPOSITORY}:latest ${ECR_URI}:latest

echo "🔐 Logging in to ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_URI}

echo "📤 Pushing to ECR..."
docker push ${ECR_URI}:latest

echo "✅ Build and push completed successfully!"
echo "Image URI: ${ECR_URI}:latest"

