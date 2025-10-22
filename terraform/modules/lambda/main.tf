# ECR repository is now managed by the ecr module

# IAM role for Lambda execution
resource "aws_iam_role" "lambda_execution" {
  name = "${var.project_name}-lambda-execution-${var.environment}"

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
    Name        = "${var.project_name}-lambda-execution-${var.environment}"
    Environment = var.environment
    Project     = var.project_name
  }
}

# Attach basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# IAM policy for Bedrock access
resource "aws_iam_role_policy" "bedrock_access" {
  name = "${var.project_name}-bedrock-access-${var.environment}"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Resource = [
          "arn:aws:bedrock:*::foundation-model/*",
          "arn:aws:bedrock:*:*:inference-profile/*"
        ]
      }
    ]
  })
}

# IAM policy for DynamoDB access
resource "aws_iam_role_policy" "dynamodb_access" {
  name = "${var.project_name}-lambda-dynamodb-access-${var.environment}"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query"
        ]
        Resource = var.dynamodb_table_arn
      }
    ]
  })
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.project_name}-story-text-regen-${var.environment}"
  retention_in_days = 7

  tags = {
    Name        = "${var.project_name}-story-text-regen-logs-${var.environment}"
    Environment = var.environment
    Project     = var.project_name
  }
}

# Lambda function
resource "aws_lambda_function" "main" {
  function_name = "${var.project_name}-story-text-regen-${var.environment}"
  role          = aws_iam_role.lambda_execution.arn
  
  package_type  = "Image"
  image_uri     = var.image_uri != "" ? var.image_uri : "${var.ecr_repository_url}:latest"
  
  timeout     = 900  # 15 minutes
  memory_size = 512  # Increased memory for better performance

  environment {
    variables = {
      ENVIRONMENT         = var.environment
      LOG_LEVEL           = "INFO"
      DYNAMODB_TABLE_NAME = var.dynamodb_table_name
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda,
    aws_iam_role_policy_attachment.lambda_basic_execution
  ]

  tags = {
    Name        = "${var.project_name}-story-text-regen-${var.environment}"
    Environment = var.environment
    Project     = var.project_name
  }
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.main.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.api_gateway_execution_arn}/*"
}
