output "lambda_repository_url" {
  description = "URL of the Lambda text ECR repository"
  value       = aws_ecr_repository.lambda.repository_url
}

output "lambda_repository_name" {
  description = "Name of the Lambda text ECR repository"
  value       = aws_ecr_repository.lambda.name
}

output "lambda_repository_arn" {
  description = "ARN of the Lambda text ECR repository"
  value       = aws_ecr_repository.lambda.arn
}

output "story_image_lambda_repository_url" {
  description = "URL of the Lambda image ECR repository"
  value       = aws_ecr_repository.story_image_lambda.repository_url
}

output "story_image_lambda_repository_name" {
  description = "Name of the Lambda image ECR repository"
  value       = aws_ecr_repository.story_image_lambda.name
}

output "story_image_lambda_repository_arn" {
  description = "ARN of the Lambda image ECR repository"
  value       = aws_ecr_repository.story_image_lambda.arn
}

output "story_generator_repository_url" {
  description = "URL of the ECS story generator ECR repository"
  value       = aws_ecr_repository.story_generator.repository_url
}

output "story_generator_repository_name" {
  description = "Name of the ECS story generator ECR repository"
  value       = aws_ecr_repository.story_generator.name
}

output "story_generator_repository_arn" {
  description = "ARN of the ECS story generator ECR repository"
  value       = aws_ecr_repository.story_generator.arn
}

