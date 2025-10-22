# ECR repository is now managed by the ecr module

# IAM role for Lambda execution
resource "aws_iam_role" "story_image_lambda_execution" {
  name = "${var.project_name}-story-image-lambda-execution-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })

  tags = {
    Name        = "${var.project_name}-story-image-lambda-execution-${var.environment}"
    Environment = var.environment
    Project     = var.project_name
  }
}

# Attach basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "story_image_lambda_basic_execution" {
  role       = aws_iam_role.story_image_lambda_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# IAM policy for S3 access
resource "aws_iam_role_policy" "story_image_s3_access" {
  name = "${var.project_name}-story-image-s3-access-${var.environment}"
  role = aws_iam_role.story_image_lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject"
        ]
        Resource = "${var.s3_bucket_arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = var.s3_bucket_arn
      }
    ]
  })
}

# IAM policy for Secrets Manager access
resource "aws_iam_role_policy" "story_image_secrets_access" {
  name = "${var.project_name}-story-image-secrets-access-${var.environment}"
  role = aws_iam_role.story_image_lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = var.google_api_key_secret_arn
      }
    ]
  })
}

# IAM policy for DynamoDB access
resource "aws_iam_role_policy" "story_image_dynamodb_access" {
  name = "${var.project_name}-story-image-dynamodb-access-${var.environment}"
  role = aws_iam_role.story_image_lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query"
        ]
        Resource = var.dynamodb_table_arn
      }
    ]
  })
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "story_image_lambda" {
  name              = "/aws/lambda/${var.project_name}-story-image-regen-${var.environment}"
  retention_in_days = 7

  tags = {
    Name        = "${var.project_name}-story-image-regen-logs-${var.environment}"
    Environment = var.environment
    Project     = var.project_name
  }
}

# Lambda function
resource "aws_lambda_function" "story_image_main" {
  function_name = "${var.project_name}-story-image-regen-${var.environment}"
  role          = aws_iam_role.story_image_lambda_execution.arn
  
  package_type  = "Image"
  image_uri     = var.image_uri != "" ? var.image_uri : "${var.ecr_repository_url}:latest"
  
  timeout     = 900  # 15 minutes (for image generation)
  memory_size = 2048  # Increased memory for image processing

  environment {
    variables = {
      ENVIRONMENT          = var.environment
      LOG_LEVEL            = "INFO"
      S3_BUCKET            = var.s3_bucket_name
      GOOGLE_API_KEY_SECRET_ARN = var.google_api_key_secret_arn
      DYNAMODB_TABLE_NAME  = var.dynamodb_table_name
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.story_image_lambda,
    aws_iam_role_policy_attachment.story_image_lambda_basic_execution,
    aws_iam_role_policy.story_image_s3_access,
    aws_iam_role_policy.story_image_secrets_access,
    aws_iam_role_policy.story_image_dynamodb_access
  ]

  tags = {
    Name        = "${var.project_name}-story-image-regen-${var.environment}"
    Environment = var.environment
    Project     = var.project_name
  }
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "story_image_api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.story_image_main.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${var.api_gateway_execution_arn}/*/*"
}

