# ECS Fargate Module

This module creates an ECS Fargate deployment for the Story-42 AI agent service.

## Architecture

The module creates:
- **ECS Cluster**: Fargate-based cluster for running containerized applications
- **ECS Service**: Service running the Story-42 AI agent
- **Application Load Balancer**: Internet-facing ALB for HTTP traffic
- **ECR Repository**: Container registry for storing Docker images
- **Security Groups**: ALB and ECS service security groups
- **IAM Roles**: Task execution and task roles with permissions for Bedrock, S3, DynamoDB, and Cognito
- **CloudWatch Logs**: Log group for ECS container logs

## Features

- **Conditional Deployment**: Module is created when `images_ready = true` in the environment configuration
- **Zero-downtime Deployment**: Supports `desired_count = 0` until container image is pushed
- **Auto-scaling Ready**: Configured with deployment circuit breaker and health checks
- **Integration with Existing Resources**: Reuses Cognito, S3, and DynamoDB from other modules

## Usage

### Step 1: Enable ECS Deployment (First Run)

```hcl
# terraform.tfvars
images_ready = true  # Controls module creation at environment level
images_ready = false  # No images yet, only creates ECR
```

```bash
terraform apply
```

This creates:
- ECR repository
- ECS cluster
- ECS service with `desired_count = 0` (no tasks running)
- ALB and target group
- All supporting infrastructure

### Step 2: Build and Push Container Image

```bash
# Get ECR repository URL
ECR_URL=$(terraform output -raw ecs_ecr_repository_url)

# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ECR_URL

# Build your Docker image
docker build -t story-generator .

# Tag the image
docker tag story-generator:latest ${ECR_URL}:latest

# Push to ECR
docker push ${ECR_URL}:latest
```

### Step 3: Deploy Service (Second Run)

```hcl
# terraform.tfvars
images_ready = true  # Controls module creation at environment level
images_ready = true   # Images exist, create ECS cluster
ecs_desired_count     = 1
```

```bash
terraform apply
```

This updates:
- ECS service `desired_count` from 0 to 1
- Launches 1 task with your container image
- Registers task with ALB target group

### Step 4: Access Service

```bash
# Get ALB endpoint
terraform output ecs_service_endpoint
# Output: http://story-42-alb-dev-123456789.us-east-1.elb.amazonaws.com

# Test health endpoint
curl http://<alb-dns>/health
```

## Variables

### Required Variables

| Variable | Description |
|----------|-------------|
| `project_name` | Project name for resource naming |
| `environment` | Environment (dev, staging, prod) |
| `vpc_id` | VPC ID for ECS deployment |
| `public_subnet_ids` | List of public subnet IDs (min 2 in different AZs) |
| `cognito_user_pool_id` | Cognito User Pool ID (from existing module) |
| `cognito_user_pool_arn` | Cognito User Pool ARN |
| `cognito_client_id` | Cognito Client ID |
| `s3_bucket_name` | S3 bucket name for storage |
| `s3_bucket_arn` | S3 bucket ARN |
| `dynamodb_table_name` | DynamoDB sessions table name |
| `dynamodb_table_arn` | DynamoDB sessions table ARN |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ecs_desired_count` | `1` | Number of ECS tasks to run |
| `ecs_image_tag` | `"latest"` | ECR image tag to use |
| `ecs_cpu` | `"512"` | Task CPU units (0.5 vCPU) |
| `ecs_memory` | `"1024"` | Task memory in MB (1 GB) |
| `bedrock_model_id` | `"us.amazon.nova-pro-v1:0"` | Bedrock model for text generation |
| `bedrock_image_model_id` | `"stability.sd3-5-large-v1:0"` | Bedrock model for image generation |
| `log_level` | `"INFO"` | Application log level |

## Outputs

| Output | Description |
|--------|-------------|
| `cluster_name` | ECS cluster name |
| `service_name` | ECS service name |
| `alb_dns_name` | ALB DNS name |
| `service_endpoint` | HTTP endpoint URL |
| `ecr_repository_url` | ECR repository URL |
| `desired_count` | Current desired task count |

## Security

### IAM Permissions

The ECS task role has permissions for:
- **Bedrock**: `InvokeModel`, `InvokeModelWithResponseStream`
- **S3**: `GetObject`, `PutObject`, `ListBucket` (specific bucket)
- **DynamoDB**: `GetItem`, `PutItem`, `UpdateItem`, `Query`, `Scan` (specific table)
- **Cognito**: `GetUser`, `AdminGetUser` (specific user pool)

### Network Security

- **ALB Security Group**: Allows HTTP (port 80) from `0.0.0.0/0`
- **ECS Service Security Group**: Only allows traffic from ALB on port 8000
- **Egress**: All outbound traffic allowed (for AWS API calls)

## Monitoring

### CloudWatch Logs

Container logs are sent to: `/ecs/story-42-dev`

Retention: 7 days

### View Logs

```bash
# Get log group name
LOG_GROUP=$(terraform output ecs_log_group_name)

# Stream logs
aws logs tail $LOG_GROUP --follow
```

### Health Check

- **Path**: `/health`
- **Interval**: 30 seconds
- **Timeout**: 5 seconds
- **Healthy Threshold**: 2 consecutive successes
- **Unhealthy Threshold**: 3 consecutive failures

## Scaling

To scale the service:

```hcl
# terraform.tfvars
ecs_desired_count = 3  # Scale to 3 tasks
```

```bash
terraform apply
```

## Troubleshooting

### Service not starting (desired count = 0)

**Cause**: `images_ready = false` at environment level

**Solution**: 
1. Push images to ECR
2. Set `images_ready = true` in terraform.tfvars
3. Run `terraform apply`

### Tasks failing health checks

**Check logs:**
```bash
aws logs tail /ecs/story-42-dev --follow
```

**Common issues:**
- Application not listening on port 8000
- `/health` endpoint not implemented
- Incorrect environment variables

### Cannot pull image from ECR

**Check IAM permissions:**
- Task execution role needs `ecr:GetAuthorizationToken`, `ecr:BatchGetImage`
- Check CloudWatch logs for specific error

## Cost Estimate

| Resource | Monthly Cost (estimate) |
|----------|------------------------|
| ECS Fargate (1 task, 0.5 vCPU, 1GB) | ~$15 |
| Application Load Balancer | ~$23 |
| ECR Storage (5 images, ~2GB) | ~$0.20 |
| CloudWatch Logs (1GB/month) | ~$0.50 |
| **Total** | **~$39/month** |

## Maintenance

### Update Container Image

1. Build and push new image with same tag
2. Force new deployment:
   ```bash
   aws ecs update-service \
     --cluster story-42-ecs-cluster-dev \
     --service story-generator \
     --force-new-deployment
   ```

### Destroy Infrastructure

```hcl
# terraform.tfvars
images_ready = false  # Only creates ECR and infrastructure
```

```bash
terraform apply
```

All ECS resources will be destroyed.

