output "cognito_user_pool_id" {
  description = "ID of the Cognito user pool"
  value       = module.cognito.user_pool_id
}

output "cognito_user_pool_client_id" {
  description = "ID of the Cognito user pool client"
  value       = module.cognito.user_pool_client_id
}

output "cognito_user_pool_domain" {
  description = "Domain of the Cognito user pool"
  value       = module.cognito.user_pool_domain
}

output "admin_username" {
  description = "Username of the admin user"
  value       = module.cognito.admin_username
}

output "lambda_function_name" {
  description = "Name of the Lambda function"
  value       = var.images_ready ? module.lambda[0].function_name : "Not deployed - set images_ready = true"
}

output "lambda_ecr_repository_url" {
  description = "URL of the Lambda text ECR repository"
  value       = module.ecr.lambda_repository_url
}

output "api_endpoint" {
  description = "Base URL of the API Gateway"
  value       = var.images_ready ? module.api_gateway[0].api_endpoint : "Not deployed - set images_ready = true"
}

output "generate_story_endpoint" {
  description = "Full URL for the /generate-story endpoint (requires authentication)"
  value       = var.images_ready ? module.api_gateway[0].generate_story_endpoint : "Not deployed - set images_ready = true"
}

output "regenerate_segment_endpoint" {
  description = "Full URL for the /regenerate-segment endpoint (requires authentication)"
  value       = var.images_ready ? module.api_gateway[0].regenerate_segment_endpoint : "Not deployed - set images_ready = true"
}

output "generate_story_outline_endpoint" {
  description = "Full URL for the /generate-story-outline endpoint (requires authentication)"
  value       = var.images_ready ? module.api_gateway[0].generate_story_outline_endpoint : "Not deployed - set images_ready = true"
}

output "generate_story_image_endpoint" {
  description = "Full URL for the /generate-story-image endpoint (requires authentication)"
  value       = var.images_ready ? module.api_gateway[0].generate_story_image_endpoint : "Not deployed - set images_ready = true"
}

output "regenerate_segment_image_endpoint" {
  description = "Full URL for the /regenerate-segment-image endpoint (requires authentication)"
  value       = var.images_ready ? module.api_gateway[0].regenerate_segment_image_endpoint : "Not deployed - set images_ready = true"
}

output "region" {
  description = "AWS region"
  value       = var.region
}

# Story Image Lambda outputs
output "story_image_lambda_function_name" {
  description = "Name of the story image Lambda function"
  value       = var.images_ready ? module.story_image_lambda[0].lambda_function_name : "Not deployed - set images_ready = true"
}

output "story_image_ecr_repository_url" {
  description = "URL of the story image ECR repository"
  value       = module.ecr.story_image_lambda_repository_url
}

# S3 and Secrets outputs
output "story_images_bucket_name" {
  description = "Name of the S3 bucket for story images"
  value       = module.s3_storage.bucket_name
}

output "google_api_key_secret_name" {
  description = "Name of the Secrets Manager secret for Google API Key"
  value       = module.secrets.google_api_key_secret_name
}

# DynamoDB outputs
output "dynamodb_table_name" {
  description = "Name of the DynamoDB table for story sessions"
  value       = module.dynamodb.table_name
}

output "dynamodb_table_arn" {
  description = "ARN of the DynamoDB table"
  value       = module.dynamodb.table_arn
}

output "generate_topics_ideas_endpoint" {
  description = "Full URL for the /generate-topics-ideas endpoint (requires authentication)"
  value       = var.images_ready ? module.api_gateway[0].generate_topics_ideas_endpoint : "Not deployed - set images_ready = true"
}

# CloudFront and Website outputs
output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.cloudfront.cloudfront_distribution_id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = module.cloudfront.cloudfront_domain_name
}

output "website_url" {
  description = "Primary URL to access the static website"
  value       = local.use_custom_domain ? "https://www.${var.project_name}.${var.domain_name}" : "https://${module.cloudfront.cloudfront_domain_name}"
}

output "website_url_alternate" {
  description = "Alternate URL to access the static website (only if custom domain enabled)"
  value       = local.use_custom_domain ? "https://${var.project_name}.${var.domain_name}" : null
}

output "route53_nameservers" {
  description = "Route 53 nameservers (configure in your domain registrar if using custom domain)"
  value       = local.use_custom_domain ? aws_route53_zone.public_zone[0].name_servers : null
}

output "route53_zone_id" {
  description = "Route 53 hosted zone ID"
  value       = local.use_custom_domain ? aws_route53_zone.public_zone[0].zone_id : null
}

#######################################
# ECS Fargate Outputs
#######################################
output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = var.images_ready ? module.ecs_fargate[0].cluster_name : "Not deployed"
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = var.images_ready ? module.ecs_fargate[0].cluster_arn : ""
}

output "ecs_service_name" {
  description = "Name of the ECS service"
  value       = var.images_ready ? module.ecs_fargate[0].service_name : "Not deployed"
}

output "ecs_alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = var.images_ready ? module.ecs_fargate[0].alb_dns_name : "Not deployed"
}

output "ecs_service_endpoint" {
  description = "HTTP endpoint to access the ECS service"
  value       = var.images_ready ? module.ecs_fargate[0].service_endpoint : "Not deployed"
}

output "ecs_ecr_repository_url" {
  description = "URL of the ECR repository for ECS agent"
  value       = module.ecr.story_generator_repository_url
}

output "ecs_ecr_repository_name" {
  description = "Name of the ECR repository"
  value       = module.ecr.story_generator_repository_name
}

output "ecs_desired_count" {
  description = "Current desired count of ECS tasks"
  value       = var.images_ready ? module.ecs_fargate[0].desired_count : 0
}

output "ecs_log_group_name" {
  description = "CloudWatch log group for ECS"
  value       = var.images_ready ? module.ecs_fargate[0].log_group_name : "Not deployed"
}
