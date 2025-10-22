variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
}

variable "region" {
  description = "AWS region"
  type        = string
}

variable "ecr_repository_url" {
  description = "URL of the ECR repository (provided by ecr module)"
  type        = string
}

variable "image_uri" {
  description = "URI of the Docker image in ECR"
  type        = string
  default     = ""
}

variable "api_gateway_execution_arn" {
  description = "Execution ARN of the API Gateway"
  type        = string
}

variable "s3_bucket_name" {
  description = "Name of the S3 bucket for storing images"
  type        = string
}

variable "s3_bucket_arn" {
  description = "ARN of the S3 bucket for storing images"
  type        = string
}

variable "google_api_key_secret_arn" {
  description = "ARN of the Secrets Manager secret containing Google API key"
  type        = string
}

variable "dynamodb_table_name" {
  description = "Name of the DynamoDB table for session tracking"
  type        = string
}

variable "dynamodb_table_arn" {
  description = "ARN of the DynamoDB table for session tracking"
  type        = string
}

