# Deployment Guide - Story Creator Agent

## Prerequisites

- AWS Account with Bedrock access
- AWS CLI configured
- Python 3.11+
- Docker (for containerized deployment)

---

## AWS Setup

### 1. Enable Bedrock Models

Enable Claude 3.5 Sonnet in your AWS account:

```bash
# Check model access
aws bedrock list-foundation-models \
  --region us-east-1 \
  --query 'modelSummaries[?contains(modelId, `claude`)]' | cat

# Request model access if needed (via AWS Console)
# Go to: Bedrock → Model Access → Request Access
```

**Important**: Bedrock model access is **per region** and **per account**. You must request access for each model you want to use.

---

### 2. Create DynamoDB Table

Create the session storage table:

```bash
aws dynamodb create-table \
  --table-name story-creator-sessions \
  --attribute-definitions \
    AttributeName=session_id,AttributeType=S \
    AttributeName=user_id,AttributeType=S \
  --key-schema \
    AttributeName=session_id,KeyType=HASH \
  --global-secondary-indexes \
    "IndexName=user_id-index,\
     KeySchema=[{AttributeName=user_id,KeyType=HASH}],\
     Projection={ProjectionType=ALL},\
     ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}" \
  --provisioned-throughput \
    ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --region us-east-1 | cat

# Enable TTL for automatic cleanup
aws dynamodb update-time-to-live \
  --table-name story-creator-sessions \
  --time-to-live-specification \
    "Enabled=true,AttributeName=ttl" \
  --region us-east-1 | cat
```

**Why These Settings?**
- **Provisioned Throughput**: Start with 5 RCU/WCU, can scale later
- **GSI on user_id**: Enables listing all sessions for a user
- **TTL**: Auto-deletes sessions after 30 days (saves costs)

---

### 3. Create S3 Bucket

Create bucket for large content:

```bash
aws s3 mb s3://story-creator-drafts-YOUR-ACCOUNT-ID --region us-east-1

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket story-creator-drafts-YOUR-ACCOUNT-ID \
  --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' | cat

# Enable versioning (optional but recommended)
aws s3api put-bucket-versioning \
  --bucket story-creator-drafts-YOUR-ACCOUNT-ID \
  --versioning-configuration Status=Enabled | cat

# Set lifecycle policy to delete old objects
aws s3api put-bucket-lifecycle-configuration \
  --bucket story-creator-drafts-YOUR-ACCOUNT-ID \
  --lifecycle-configuration file://lifecycle-policy.json | cat
```

**lifecycle-policy.json**:
```json
{
  "Rules": [
    {
      "Id": "DeleteOldDrafts",
      "Status": "Enabled",
      "Prefix": "sessions/",
      "Expiration": {
        "Days": 30
      }
    }
  ]
}
```

---

### 4. Create IAM Role

Create execution role for the agent:

```bash
# Create trust policy
cat > trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "bedrock.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create role
aws iam create-role \
  --role-name StoryCreatorAgentRole \
  --assume-role-policy-document file://trust-policy.json | cat

# Create permission policy
cat > agent-permissions.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": "arn:aws:bedrock:*:*:foundation-model/anthropic.claude-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/story-creator-sessions",
        "arn:aws:dynamodb:*:*:table/story-creator-sessions/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::story-creator-drafts-*/*"
    }
  ]
}
EOF

# Attach policy
aws iam put-role-policy \
  --role-name StoryCreatorAgentRole \
  --policy-name StoryCreatorPermissions \
  --policy-document file://agent-permissions.json | cat
```

---

## Deployment Options

### Option 1: AWS Bedrock AgentCore (Recommended)

**Why AgentCore?**
- Serverless, fully managed
- Auto-scales with load
- Built-in security and monitoring
- No infrastructure management

**Steps**:

1. Package your agent:
```bash
cd /home/shahab/dev/work/hacka/Strands/agent
zip -r agent.zip src/ requirements.txt
```

2. Upload to S3:
```bash
aws s3 cp agent.zip s3://your-deployment-bucket/agent.zip
```

3. Create AgentCore agent (via AWS Console or CLI):
```bash
# This is a placeholder - AgentCore CLI commands vary
# Follow AWS documentation for your region
```

4. Configure endpoints and invoke via API Gateway

---

### Option 2: AWS ECS/Fargate

**Why ECS?**
- Containerized deployment
- Good for stateful applications
- Scales horizontally
- Easier debugging than Lambda

**Steps**:

1. Create Dockerfile:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

EXPOSE 8000

CMD ["uvicorn", "src.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

2. Build and push to ECR:
```bash
# Create ECR repository
aws ecr create-repository --repository-name story-creator-agent --region us-east-1 | cat

# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com

# Build image
docker build -t story-creator-agent .

# Tag and push
docker tag story-creator-agent:latest YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/story-creator-agent:latest
docker push YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/story-creator-agent:latest
```

3. Create ECS Task Definition:
```json
{
  "family": "story-creator-agent",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::YOUR_ACCOUNT:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::YOUR_ACCOUNT:role/StoryCreatorAgentRole",
  "containerDefinitions": [
    {
      "name": "story-creator",
      "image": "YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/story-creator-agent:latest",
      "portMappings": [
        {
          "containerPort": 8000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "AWS_REGION", "value": "us-east-1"},
        {"name": "BEDROCK_MODEL_ID", "value": "anthropic.claude-3-5-sonnet-20241022-v2:0"},
        {"name": "SESSION_TABLE_NAME", "value": "story-creator-sessions"},
        {"name": "SESSION_BUCKET_NAME", "value": "story-creator-drafts-YOUR_ACCOUNT"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/story-creator-agent",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

4. Create ECS Service with ALB

---

### Option 3: AWS Lambda

**Why Lambda?**
- Cost-effective for low traffic
- Zero infrastructure
- Scales automatically

**Limitations**:
- 15-minute timeout (problematic for long story generation)
- Cold starts
- Not ideal for long-running operations

**Use Case**: Best for API endpoints, not for generation jobs

---

## Environment Configuration

Create `.env` file (or use AWS Parameter Store/Secrets Manager):

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret

# Bedrock
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
BEDROCK_MAX_TOKENS=4096

# External Services
VOICE_GENERATION_CONTAINER_URL=http://voice-service:8080
IMAGE_GENERATION_SERVICE_URL=http://image-service:8080

# Storage
SESSION_TABLE_NAME=story-creator-sessions
SESSION_BUCKET_NAME=story-creator-drafts-YOUR_ACCOUNT

# API
PORT=8000
ENVIRONMENT=production
CORS_ORIGINS=https://yourdomain.com
LOG_LEVEL=INFO
```

---

## Running Locally

For development and testing:

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run API server
cd src
python -m api.app

# Or with uvicorn directly
uvicorn src.api.app:app --reload --port 8000
```

Access API docs at: `http://localhost:8000/docs`

---

## Monitoring & Logging

### CloudWatch Logs

All application logs go to CloudWatch:

```bash
# View logs
aws logs tail /ecs/story-creator-agent --follow | cat

# Filter for errors
aws logs filter-log-events \
  --log-group-name /ecs/story-creator-agent \
  --filter-pattern "ERROR" | cat
```

### Metrics

Key metrics to monitor:

- Request latency (p50, p95, p99)
- Error rate
- Bedrock invocation count
- DynamoDB read/write units
- External service failures

### Alerts

Set up CloudWatch alarms:

```bash
# High error rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name story-creator-high-errors \
  --alarm-description "High error rate in story creator" \
  --metric-name ErrorCount \
  --namespace AWS/ECS \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 | cat
```

---

## Cost Optimization

### Bedrock Costs

Claude 3.5 Sonnet pricing (as of 2025):
- Input: $3 per 1M tokens
- Output: $15 per 1M tokens

**Estimated cost per story**:
- Idea generation: 3K tokens × $15 = ~$0.05
- Story drafting: 5K tokens × $15 = ~$0.08
- Rewrites (2 scenes): 2K tokens × $15 = ~$0.03
- **Total: ~$0.16 per story**

### DynamoDB Costs

- Provisioned: $0.25 per WCU-month, $0.05 per RCU-month
- On-Demand: $1.25 per million writes, $0.25 per million reads

**Recommendation**: Start with Provisioned (5 RCU/5 WCU), switch to On-Demand if traffic is spiky

### S3 Costs

- Storage: $0.023 per GB-month
- GET requests: $0.0004 per 1000
- PUT requests: $0.005 per 1000

**With TTL**: Old files automatically deleted, storage costs minimal

---

## Security Best Practices

1. **IAM Principle of Least Privilege**: Only grant necessary permissions
2. **Encryption**: Enable at rest (DynamoDB, S3) and in transit (HTTPS)
3. **VPC**: Deploy in private subnets with NAT Gateway
4. **API Authentication**: Add JWT or API keys (not included in base implementation)
5. **Rate Limiting**: Prevent abuse (implement with API Gateway or WAF)
6. **Secrets Management**: Use AWS Secrets Manager for sensitive data

---

## Rollback Plan

If deployment fails:

1. **ECS**: Revert to previous task definition revision
2. **Lambda**: Publish new version, update alias
3. **AgentCore**: Revert agent configuration

```bash
# ECS rollback
aws ecs update-service \
  --cluster story-creator-cluster \
  --service story-creator-service \
  --task-definition story-creator-agent:PREVIOUS_REVISION | cat
```

---

## Validation Steps

After deployment:

1. **Health Check**:
```bash
curl https://your-api-domain.com/health
```

2. **Test Story Creation**:
```bash
curl -X POST https://your-api-domain.com/api/v1/story/start \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test_user", "story_idea": "A robot learning to feel emotions"}'
```

3. **Check Logs**: Verify no errors in CloudWatch

4. **Monitor Metrics**: Watch CloudWatch dashboard for 24 hours

---

## Troubleshooting

### Common Issues

**"Access Denied" on Bedrock**:
- Check model access in Bedrock console
- Verify IAM role has `bedrock:InvokeModel` permission
- Confirm model ID is correct for your region

**"Table not found" on DynamoDB**:
- Verify table name in environment variables
- Check table exists in correct region
- Confirm IAM role has DynamoDB permissions

**Timeout on Voice/Image Generation**:
- Check external service URLs
- Verify network connectivity (VPC, security groups)
- Increase timeout in tool functions

---

## Next Steps

1. Set up CI/CD pipeline (GitHub Actions, CodePipeline)
2. Implement authentication (Cognito, Auth0)
3. Add rate limiting
4. Set up monitoring dashboards
5. Perform load testing
6. Document API for frontend team

---

## Support

For issues or questions:
- Check `docs/architecture/ARCHITECTURE.md`
- Review AWS Bedrock documentation
- Contact AWS Support for Bedrock-specific issues

