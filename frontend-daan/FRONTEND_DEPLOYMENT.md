# Frontend Deployment Guide

This guide explains how to deploy the `frontend-daan` Vite application to the static website bucket managed by Terraform. The `deploy-frontend.sh` helper script automates the build-and-sync workflow.

## Prerequisites
- Node.js 18+ and npm
- AWS CLI v2 configured with the `sandbox-dev` profile (or equivalent credentials)
- Terraform set to `allow_public_website_access = true` for the target S3 bucket if you expect direct HTTP access

## Default Deployment (dev / us-east-1)
From the repository root:

```bash
./frontend-daan/deploy-frontend.sh
```

This command:
1. Installs dependencies (`npm install`)
2. Builds the production bundle (`npm run build`)
3. Syncs `dist/` to `s3://story-42-dev-static-website/` using the `sandbox-dev` profile

## Custom Deployment Targets
Override the defaults when deploying to other environments or regions:

```bash
./frontend-daan/deploy-frontend.sh \
  -p sandbox-dev \
  -r us-west-2 \
  -b story-42-west-dev-static-website
```

### Script Flags
- `-p` — AWS profile (default: `sandbox-dev`)
- `-r` — AWS region (default: `us-east-1`)
- `-b` — S3 bucket name (default: `story-42-dev-static-website`)

## CloudFront Cache Invalidation (Optional)
If CloudFront fronts the bucket, invalidate cached assets after deployment:

```bash
aws cloudfront create-invalidation \
  --distribution-id <distribution_id> \
  --paths "/*" \
  --profile sandbox-dev \
  --region us-east-1
```

## Troubleshooting
- **403 AccessDenied** — Ensure Terraform applied with `allow_public_website_access = true` or access the site through CloudFront.
- **Mixed Content Warnings** — Serve the backend via HTTPS (ALB + ACM certificate) when the frontend loads over HTTPS.
- **Large Bundle Warning** — Consider code-splitting or adjusting Vite's `build.chunkSizeWarningLimit` if the bundle exceeds 500 kB.

## Notes
- The legacy `frontend/` directory contains an older Vite project kept for reference. All current work and deployments should use `frontend-daan/`.
- Terraform will recreate the S3 bucket policy on the next `terraform apply`; keep any manual changes reflected in the IaC configuration.

