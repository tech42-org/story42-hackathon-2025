variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "aws-hackathon-2025"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "availability_zones" {
  description = "Availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "admin_email" {
  description = "Email address for the admin user"
  type        = string
}

variable "admin_temp_password" {
  description = "Temporary password for the admin user"
  type        = string
  sensitive   = true
}

variable "lambda_image_uri" {
  description = "URI of the Docker image in ECR for story-text-regen Lambda"
  type        = string
  default     = ""
}

variable "story_image_lambda_uri" {
  description = "URI of the Docker image in ECR for story-image-regen Lambda"
  type        = string
  default     = ""
}

variable "google_api_key" {
  description = "Google API Key for Gemini (optional - can be set manually in Secrets Manager)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "domain_name" {
  description = "Domain name"
  type        = string
}

variable "enable_custom_domain" {
  description = "Enable custom domain for CloudFront (requires domain_name)"
  type        = bool
  default     = false
}

variable "allow_public_website_access" {
  description = "Allow direct public access to the static website bucket"
  type        = bool
  default     = false
}

#######################################
# ECS Fargate Configuration
#######################################
variable "ecs_image_tag" {
  description = "ECR image tag to use"
  type        = string
  default     = "latest"
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

variable "vpc_id" {
  description = "VPC ID for ECS deployment"
  type        = string
  default     = "vpc-0f9c8a9f812ceda37"
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for ALB and ECS"
  type        = list(string)
  default     = [
    "subnet-0ba2b443ef38fb51c",  # us-east-1d
    "subnet-0fbbd905df79e993c"   # us-east-1b
  ]
}

#######################################
# Tech42 TTS Configuration
#######################################
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

#######################################
# Bedrock Configuration
#######################################
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

#######################################
# Application Configuration
#######################################
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

#######################################
# Deployment Control
#######################################
variable "images_ready" {
  description = "Set to true after pushing Docker images to ECR. When false: creates only infrastructure (VPC, ECR, S3, DynamoDB, Cognito). When true: creates compute services (Lambda, API Gateway, ECS)"
  type        = bool
  default     = false
}