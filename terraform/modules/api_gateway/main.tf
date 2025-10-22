# API Gateway REST API
resource "aws_api_gateway_rest_api" "main" {
  name        = "${var.project_name}-api-${var.environment}"
  description = "API Gateway for Lambda with Cognito authentication"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = {
    Name        = "${var.project_name}-api-${var.environment}"
    Environment = var.environment
    Project     = var.project_name
  }
}

# Cognito User Pool Authorizer
resource "aws_api_gateway_authorizer" "cognito" {
  name            = "${var.project_name}-cognito-authorizer-${var.environment}"
  rest_api_id     = aws_api_gateway_rest_api.main.id
  type            = "COGNITO_USER_POOLS"
  provider_arns   = [var.cognito_user_pool_arn]
  identity_source = "method.request.header.Authorization"
}

# API Gateway Resource for /generate-story
resource "aws_api_gateway_resource" "generate_story" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "generate-story"
}

# API Gateway Resource for /regenerate-segment
resource "aws_api_gateway_resource" "regenerate_segment" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "regenerate-segment"
}

# API Gateway Resource for /generate-story-outline
resource "aws_api_gateway_resource" "generate_story_outline" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "generate-story-outline"
}

# API Gateway Resource for /generate-story-image
resource "aws_api_gateway_resource" "generate_story_image" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "generate-story-image"
}

# API Gateway Resource for /regenerate-segment-image
resource "aws_api_gateway_resource" "regenerate_segment_image" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "regenerate-segment-image"
}

# API Gateway Resource for /generate-topics-ideas
resource "aws_api_gateway_resource" "generate_topics_ideas" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "generate-topics-ideas"
}

# POST method for /generate-story with Cognito authorization
resource "aws_api_gateway_method" "generate_story_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.generate_story.id
  http_method   = "POST"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

# POST method for /regenerate-segment with Cognito authorization
resource "aws_api_gateway_method" "regenerate_segment_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.regenerate_segment.id
  http_method   = "POST"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

# POST method for /generate-story-outline with Cognito authorization
resource "aws_api_gateway_method" "generate_story_outline_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.generate_story_outline.id
  http_method   = "POST"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

# POST method for /generate-story-image with Cognito authorization
resource "aws_api_gateway_method" "generate_story_image_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.generate_story_image.id
  http_method   = "POST"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

# POST method for /regenerate-segment-image with Cognito authorization
resource "aws_api_gateway_method" "regenerate_segment_image_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.regenerate_segment_image.id
  http_method   = "POST"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

# POST method for /generate-topics-ideas with Cognito authorization
resource "aws_api_gateway_method" "generate_topics_ideas_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.generate_topics_ideas.id
  http_method   = "POST"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

# Lambda integration for POST /generate-story
resource "aws_api_gateway_integration" "generate_story_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.generate_story.id
  http_method             = aws_api_gateway_method.generate_story_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arn
  timeout_milliseconds    = 180000
}

# Lambda integration for POST /regenerate-segment
resource "aws_api_gateway_integration" "regenerate_segment_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.regenerate_segment.id
  http_method             = aws_api_gateway_method.regenerate_segment_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arn
  timeout_milliseconds    = 180000
}

# Lambda integration for POST /generate-story-outline
resource "aws_api_gateway_integration" "generate_story_outline_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.generate_story_outline.id
  http_method             = aws_api_gateway_method.generate_story_outline_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arn
  timeout_milliseconds    = 180000
}

# Lambda integration for POST /generate-story-image
resource "aws_api_gateway_integration" "generate_story_image_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.generate_story_image.id
  http_method             = aws_api_gateway_method.generate_story_image_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.story_image_lambda_invoke_arn
  timeout_milliseconds    = 180000
}

# Lambda integration for POST /regenerate-segment-image
resource "aws_api_gateway_integration" "regenerate_segment_image_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.regenerate_segment_image.id
  http_method             = aws_api_gateway_method.regenerate_segment_image_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.story_image_lambda_invoke_arn
  timeout_milliseconds    = 180000
}

# Lambda integration for POST /generate-topics-ideas
resource "aws_api_gateway_integration" "generate_topics_ideas_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.generate_topics_ideas.id
  http_method             = aws_api_gateway_method.generate_topics_ideas_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arn
  timeout_milliseconds    = 180000
}

# OPTIONS method for CORS - /generate-story
resource "aws_api_gateway_method" "generate_story_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.generate_story.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# OPTIONS method for CORS - /regenerate-segment
resource "aws_api_gateway_method" "regenerate_segment_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.regenerate_segment.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# OPTIONS method for CORS - /generate-story-outline
resource "aws_api_gateway_method" "generate_story_outline_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.generate_story_outline.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# OPTIONS method for CORS - /generate-story-image
resource "aws_api_gateway_method" "generate_story_image_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.generate_story_image.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# OPTIONS method for CORS - /regenerate-segment-image
resource "aws_api_gateway_method" "regenerate_segment_image_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.regenerate_segment_image.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# OPTIONS method for CORS - /generate-topics-ideas
resource "aws_api_gateway_method" "generate_topics_ideas_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.generate_topics_ideas.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# Mock integration for OPTIONS (CORS preflight) - /generate-story
resource "aws_api_gateway_integration" "generate_story_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.generate_story.id
  http_method = aws_api_gateway_method.generate_story_options.http_method
  type        = "MOCK"
  timeout_milliseconds    = 180000

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

# Mock integration for OPTIONS (CORS preflight) - /regenerate-segment
resource "aws_api_gateway_integration" "regenerate_segment_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.regenerate_segment.id
  http_method = aws_api_gateway_method.regenerate_segment_options.http_method
  type        = "MOCK"
  timeout_milliseconds    = 180000

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

# Mock integration for OPTIONS (CORS preflight) - /generate-story-outline
resource "aws_api_gateway_integration" "generate_story_outline_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.generate_story_outline.id
  http_method = aws_api_gateway_method.generate_story_outline_options.http_method
  type        = "MOCK"
  timeout_milliseconds    = 180000

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

# Mock integration for OPTIONS (CORS preflight) - /generate-story-image
resource "aws_api_gateway_integration" "generate_story_image_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.generate_story_image.id
  http_method = aws_api_gateway_method.generate_story_image_options.http_method
  type        = "MOCK"
  timeout_milliseconds    = 180000

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

# Mock integration for OPTIONS (CORS preflight) - /regenerate-segment-image
resource "aws_api_gateway_integration" "regenerate_segment_image_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.regenerate_segment_image.id
  http_method = aws_api_gateway_method.regenerate_segment_image_options.http_method
  type        = "MOCK"
  timeout_milliseconds    = 180000

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

# Mock integration for OPTIONS (CORS preflight) - /generate-topics-ideas
resource "aws_api_gateway_integration" "generate_topics_ideas_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.generate_topics_ideas.id
  http_method = aws_api_gateway_method.generate_topics_ideas_options.http_method
  type        = "MOCK"
  timeout_milliseconds    = 180000

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "generate_story_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.generate_story.id
  http_method = aws_api_gateway_method.generate_story_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_method_response" "regenerate_segment_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.regenerate_segment.id
  http_method = aws_api_gateway_method.regenerate_segment_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_method_response" "generate_story_outline_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.generate_story_outline.id
  http_method = aws_api_gateway_method.generate_story_outline_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_method_response" "generate_story_image_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.generate_story_image.id
  http_method = aws_api_gateway_method.generate_story_image_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_method_response" "regenerate_segment_image_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.regenerate_segment_image.id
  http_method = aws_api_gateway_method.regenerate_segment_image_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_method_response" "generate_topics_ideas_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.generate_topics_ideas.id
  http_method = aws_api_gateway_method.generate_topics_ideas_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "generate_story_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.generate_story.id
  http_method = aws_api_gateway_method.generate_story_options.http_method
  status_code = aws_api_gateway_method_response.generate_story_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

resource "aws_api_gateway_integration_response" "regenerate_segment_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.regenerate_segment.id
  http_method = aws_api_gateway_method.regenerate_segment_options.http_method
  status_code = aws_api_gateway_method_response.regenerate_segment_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

resource "aws_api_gateway_integration_response" "generate_story_outline_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.generate_story_outline.id
  http_method = aws_api_gateway_method.generate_story_outline_options.http_method
  status_code = aws_api_gateway_method_response.generate_story_outline_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

resource "aws_api_gateway_integration_response" "generate_story_image_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.generate_story_image.id
  http_method = aws_api_gateway_method.generate_story_image_options.http_method
  status_code = aws_api_gateway_method_response.generate_story_image_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

resource "aws_api_gateway_integration_response" "regenerate_segment_image_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.regenerate_segment_image.id
  http_method = aws_api_gateway_method.regenerate_segment_image_options.http_method
  status_code = aws_api_gateway_method_response.regenerate_segment_image_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

resource "aws_api_gateway_integration_response" "generate_topics_ideas_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.generate_topics_ideas.id
  http_method = aws_api_gateway_method.generate_topics_ideas_options.http_method
  status_code = aws_api_gateway_method_response.generate_topics_ideas_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# Deployment
resource "aws_api_gateway_deployment" "main" {
  rest_api_id = aws_api_gateway_rest_api.main.id

  depends_on = [
    aws_api_gateway_integration.generate_story_lambda,
    aws_api_gateway_integration.regenerate_segment_lambda,
    aws_api_gateway_integration.generate_story_outline_lambda,
    aws_api_gateway_integration.generate_story_image_lambda,
    aws_api_gateway_integration.regenerate_segment_image_lambda,
    aws_api_gateway_integration.generate_topics_ideas_lambda,
    aws_api_gateway_integration.generate_story_options,
    aws_api_gateway_integration.regenerate_segment_options,
    aws_api_gateway_integration.generate_story_outline_options,
    aws_api_gateway_integration.generate_story_image_options,
    aws_api_gateway_integration.regenerate_segment_image_options,
    aws_api_gateway_integration.generate_topics_ideas_options
  ]

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.generate_story.id,
      aws_api_gateway_resource.regenerate_segment.id,
      aws_api_gateway_resource.generate_story_outline.id,
      aws_api_gateway_resource.generate_story_image.id,
      aws_api_gateway_resource.regenerate_segment_image.id,
      aws_api_gateway_resource.generate_topics_ideas.id,
      aws_api_gateway_method.generate_story_post.id,
      aws_api_gateway_method.regenerate_segment_post.id,
      aws_api_gateway_method.generate_story_outline_post.id,
      aws_api_gateway_method.generate_story_image_post.id,
      aws_api_gateway_method.regenerate_segment_image_post.id,
      aws_api_gateway_method.generate_topics_ideas_post.id,
      aws_api_gateway_integration.generate_story_lambda.id,
      aws_api_gateway_integration.regenerate_segment_lambda.id,
      aws_api_gateway_integration.generate_story_outline_lambda.id,
      aws_api_gateway_integration.generate_story_image_lambda.id,
      aws_api_gateway_integration.regenerate_segment_image_lambda.id,
      aws_api_gateway_integration.generate_topics_ideas_lambda.id,
      aws_api_gateway_method.generate_story_options.id,
      aws_api_gateway_method.regenerate_segment_options.id,
      aws_api_gateway_method.generate_story_outline_options.id,
      aws_api_gateway_method.generate_story_image_options.id,
      aws_api_gateway_method.regenerate_segment_image_options.id,
      aws_api_gateway_method.generate_topics_ideas_options.id,
      aws_api_gateway_integration.generate_story_options.id,
      aws_api_gateway_integration.regenerate_segment_options.id,
      aws_api_gateway_integration.generate_story_outline_options.id,
      aws_api_gateway_integration.generate_story_image_options.id,
      aws_api_gateway_integration.regenerate_segment_image_options.id,
      aws_api_gateway_integration.generate_topics_ideas_options.id
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Stage
resource "aws_api_gateway_stage" "main" {
  deployment_id = aws_api_gateway_deployment.main.id
  rest_api_id   = aws_api_gateway_rest_api.main.id
  stage_name    = var.environment

  tags = {
    Name        = "${var.project_name}-api-stage-${var.environment}"
    Environment = var.environment
    Project     = var.project_name
  }
}

# CloudWatch Log Group for API Gateway
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}"
  retention_in_days = 7

  tags = {
    Name        = "${var.project_name}-api-logs-${var.environment}"
    Environment = var.environment
    Project     = var.project_name
  }
}

# Enable CloudWatch logging for API Gateway
# Note: Requires CloudWatch Logs role ARN to be set in account settings
# resource "aws_api_gateway_method_settings" "all" {
#   rest_api_id = aws_api_gateway_rest_api.main.id
#   stage_name  = aws_api_gateway_stage.main.stage_name
#   method_path = "*/*"
#
#   settings {
#     logging_level      = "INFO"
#     data_trace_enabled = true
#     metrics_enabled    = true
#   }
# }
