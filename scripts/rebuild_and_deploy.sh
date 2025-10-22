#!/bin/bash

# Exit on error
set -e

# Set AWS environment
export AWS_PROFILE=sandbox
export AWS_REGION=us-east-1

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║         Rebuild and Deploy Lambda Functions                     ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Check if Docker is running
if ! docker ps > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# ============================================================================
# 1. Build and Deploy story-text-regen Lambda
# ============================================================================
echo "📦 [1/2] Building story-text-regen Lambda"
echo "────────────────────────────────────────────────────────────────────"

cd /Users/michaelyang/Desktop/Repositories/aws-hackathon-2025/docker/story-text-regen

echo "🔨 Building Docker image..."
docker buildx build --platform linux/amd64 --output type=docker -t story-text-regen .

echo "🏷️  Tagging image..."
ECR_URI_TEXT="008701887645.dkr.ecr.us-east-1.amazonaws.com/story-42-lambda-dev"
docker tag story-text-regen:latest ${ECR_URI_TEXT}:latest

echo "🔐 Logging in to ECR..."
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ${ECR_URI_TEXT}

echo "📤 Pushing to ECR..."
docker push ${ECR_URI_TEXT}:latest

echo "🔄 Updating Lambda function..."
aws lambda update-function-code \
  --function-name story-42-story-text-regen-dev \
  --image-uri ${ECR_URI_TEXT}:latest \
  --output json | jq -r '"Updated: " + .FunctionName + " (State: " + .State + ")"'

echo "✅ story-text-regen Lambda deployed successfully!"
echo ""

# ============================================================================
# 2. Build and Deploy story-image-regen Lambda
# ============================================================================
echo "📦 [2/2] Building story-image-regen Lambda"
echo "────────────────────────────────────────────────────────────────────"

cd /Users/michaelyang/Desktop/Repositories/aws-hackathon-2025/docker/story-image-regen

echo "🔨 Building Docker image..."
docker buildx build --platform linux/amd64 --output type=docker -t story-image-regen .

echo "🏷️  Tagging image..."
ECR_URI_IMAGE="008701887645.dkr.ecr.us-east-1.amazonaws.com/story-42-story-image-lambda-dev"
docker tag story-image-regen:latest ${ECR_URI_IMAGE}:latest

echo "🔐 Logging in to ECR..."
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ${ECR_URI_IMAGE}

echo "📤 Pushing to ECR..."
docker push ${ECR_URI_IMAGE}:latest

echo "🔄 Updating Lambda function..."
aws lambda update-function-code \
  --function-name story-42-story-image-regen-dev \
  --image-uri ${ECR_URI_IMAGE}:latest \
  --output json | jq -r '"Updated: " + .FunctionName + " (State: " + .State + ")"'

echo "✅ story-image-regen Lambda deployed successfully!"
echo ""

# ============================================================================
# Summary
# ============================================================================
echo "════════════════════════════════════════════════════════════════════"
echo "🎉 Deployment Complete!"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "📊 Lambda Functions Updated:"
echo "  1. story-42-story-text-regen-dev"
echo "  2. story-42-story-image-regen-dev"
echo ""
echo "🔗 API Endpoints:"
echo "  • /generate-story (POST) - Generate story text"
echo "  • /regenerate-segment (POST) - Regenerate story segment"
echo "  • /generate-story-images (POST) - Generate story images"
echo "  • /regenerate-segment-image (POST) - Regenerate segment image"
echo ""
echo "📝 Required Parameters Now Include:"
echo "  • job_id - Unique identifier for the story generation job"
echo "  • user_request - (For regenerate routes) User's specific modification request"
echo ""
echo "✨ Both Lambdas now support:"
echo "  ✓ user_id (from Cognito)"
echo "  ✓ job_id tracking"
echo "  ✓ Enhanced logging with [Job: job_id] tags"
echo ""

