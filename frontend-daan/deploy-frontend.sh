#!/usr/bin/env bash
set -euo pipefail

PROFILE="sandbox-dev"
REGION="us-east-1"
BUCKET="story-42-dev-static-website"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<USAGE
Usage: $0 [-p profile] [-r region] [-b bucket]

  -p profile  AWS profile to use (default: sandbox-dev)
  -r region   AWS region (default: us-east-1)
  -b bucket   S3 bucket for static site (default: story-42-dev-static-website)
USAGE
  exit 1
}

while getopts ":p:r:b:h" opt; do
  case "$opt" in
    p) PROFILE="$OPTARG" ;;
    r) REGION="$OPTARG" ;;
    b) BUCKET="$OPTARG" ;;
    h) usage ;;
    :) echo "Option -$OPTARG requires an argument" >&2; usage ;;
    \?) echo "Invalid option: -$OPTARG" >&2; usage ;;
  esac
done

pushd "$PROJECT_DIR" >/dev/null

echo "📦 Installing dependencies"
npm install

echo "🏗️  Building production bundle"
npm run build

echo "🚀 Syncing dist/ to s3://$BUCKET (profile=$PROFILE, region=$REGION)"
AWS_PROFILE="$PROFILE" aws s3 sync dist/ "s3://$BUCKET/" --delete --region "$REGION"

echo "✅ Frontend deployed to s3://$BUCKET"
popd >/dev/null
