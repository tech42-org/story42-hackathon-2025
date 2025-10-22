variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "vpc_id" {
  description = "VPC ID for ECS deployment"
  type        = string
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs for ALB"
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for ECS tasks"
  type        = list(string)
  default     = []
}

variable "ecs_image_tag" {
  description = "ECR image tag to use"
  type        = string
  default     = "latest"
}

variable "ecr_repository_url" {
  description = "URL of the ECR repository (provided by ecr module)"
  type        = string
}

variable "ecs_container_image" {
  description = "Full ECR image URI (optional, overrides auto-generated URI)"
  type        = string
  default     = ""
}

variable "ecs_desired_count" {
  description = "Desired number of ECS tasks to run"
  type        = number
  default     = 1
}

variable "ecs_cpu" {
  description = "ECS task CPU units"
  type        = string
  default     = "512"
}

variable "ecs_memory" {
  description = "ECS task memory (MB)"
  type        = string
  default     = "1024"
}

# Cognito configuration (from existing resources)
variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  type        = string
}

variable "cognito_user_pool_arn" {
  description = "Cognito User Pool ARN"
  type        = string
}

variable "cognito_client_id" {
  description = "Cognito Client ID"
  type        = string
}

# S3 configuration (from existing resources)
variable "s3_bucket_name" {
  description = "S3 bucket name for storage"
  type        = string
}

variable "s3_bucket_arn" {
  description = "S3 bucket ARN"
  type        = string
}

# DynamoDB configuration (from existing resources)
variable "dynamodb_table_name" {
  description = "DynamoDB sessions table name"
  type        = string
}

variable "dynamodb_table_arn" {
  description = "DynamoDB sessions table ARN"
  type        = string
}

# Tech42 TTS configuration
variable "tech42_tts_api_url" {
  description = "Tech42 TTS API URL"
  type        = string
  default     = "http://tech42-tts-gpu-alb-1201907864.us-east-1.elb.amazonaws.com:82"
}

variable "tech42_tts_api_key" {
  description = "Tech42 TTS API key"
  type        = string
  default     = "abcdefg"
  sensitive   = true
}

variable "tech42_tts_default_voice" {
  description = "Default voice for Tech42 TTS"
  type        = string
  default     = "en-Alice_woman"
}

# Bedrock configuration
variable "bedrock_model_id" {
  description = "Bedrock model ID for story generation"
  type        = string
  default     = "us.amazon.nova-pro-v1:0"
}

variable "bedrock_max_tokens" {
  description = "Maximum tokens for Bedrock"
  type        = number
  default     = 4096
}

variable "bedrock_image_model_id" {
  description = "Bedrock image model ID"
  type        = string
  default     = "stability.sd3-5-large-v1:0"
}

variable "bedrock_image_region" {
  description = "Bedrock image region"
  type        = string
  default     = "us-west-2"
}

# Application configuration
variable "cors_origins" {
  description = "CORS allowed origins"
  type        = string
  default     = "http://localhost:5173,http://localhost:3456"
}

variable "log_level" {
  description = "Application log level"
  type        = string
  default     = "INFO"
}

variable "tags" {
  description = "Additional tags for resources"
  type        = map(string)
  default     = {}
}


