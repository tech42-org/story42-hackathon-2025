

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Locals for domain configuration
locals {
  # Simple: if enable_custom_domain is true and domain_name is not empty
  use_custom_domain = var.enable_custom_domain && var.domain_name != ""
}

# VPC Module (simplified public configuration)
module "vpc" {
  source = "../../../modules/vpc"

  project_name       = var.project_name
  environment        = var.environment
  region             = var.region
  
  # Network configuration
  vpc_cidr             = "10.200.0.0/16"
  availability_zones   = var.availability_zones
  public_subnet_cidrs  = ["10.200.1.0/24", "10.200.2.0/24"]
  private_subnet_cidrs = ["10.200.11.0/24", "10.200.12.0/24"]
  
  # Public configuration - no NAT Gateway needed
  enable_nat_gateway = false
  
  # No VPC Endpoints - direct internet access via IGW
  enable_vpc_endpoints = false
}

# Cognito module
module "cognito" {
  source = "../../../modules/cognito"

  project_name        = var.project_name
  environment         = var.environment
  admin_email         = var.admin_email
  admin_temp_password = var.admin_temp_password
}

#######################################
# ECR Module - Always Created (Phase 1)
#######################################
module "ecr" {
  source = "../../../modules/ecr"

  project_name = var.project_name
  environment  = var.environment
}

#######################################
# Compute Modules - Created When images_ready = true (Phase 2)
#######################################

# API Gateway module
module "api_gateway" {
  count  = var.images_ready ? 1 : 0
  source = "../../../modules/api_gateway"

  project_name                   = var.project_name
  environment                    = var.environment
  cognito_user_pool_arn          = module.cognito.user_pool_arn
  lambda_invoke_arn              = module.lambda[0].invoke_arn
  story_image_lambda_invoke_arn  = module.story_image_lambda[0].lambda_invoke_arn
}

# Lambda module
module "lambda" {
  count  = var.images_ready ? 1 : 0
  source = "../../../modules/lambda"

  project_name              = var.project_name
  environment               = var.environment
  region                    = var.region
  image_uri                 = var.lambda_image_uri
  ecr_repository_url        = module.ecr.lambda_repository_url
  api_gateway_execution_arn = module.api_gateway[0].api_execution_arn
  dynamodb_table_name       = module.dynamodb.table_name
  dynamodb_table_arn        = module.dynamodb.table_arn
}

# Secrets module
module "secrets" {
  source = "../../../modules/secrets"

  project_name   = var.project_name
  environment    = var.environment
  google_api_key = var.google_api_key
}

# S3 Storage module
module "s3_storage" {
  source = "../../../modules/s3_storage"

  project_name = var.project_name
  environment  = var.environment
}

# DynamoDB module
module "dynamodb" {
  source = "../../../modules/dynamodb"

  project_name = var.project_name
  environment  = var.environment
}

# Story Image Lambda module
module "story_image_lambda" {
  count  = var.images_ready ? 1 : 0
  source = "../../../modules/story_image_lambda"

  project_name                = var.project_name
  environment                 = var.environment
  region                      = var.region
  image_uri                   = var.story_image_lambda_uri
  ecr_repository_url          = module.ecr.story_image_lambda_repository_url
  api_gateway_execution_arn   = module.api_gateway[0].api_execution_arn
  s3_bucket_name              = module.s3_storage.bucket_name
  s3_bucket_arn               = module.s3_storage.bucket_arn
  google_api_key_secret_arn   = module.secrets.google_api_key_secret_arn
  dynamodb_table_name         = module.dynamodb.table_name
  dynamodb_table_arn          = module.dynamodb.table_arn
}

# CloudFront module
module "cloudfront" {
  source = "../../../modules/cloudfront"

  project_name           = var.project_name
  environment            = var.environment
  domain_name            = local.use_custom_domain ? "www.${var.project_name}.${var.domain_name}" : ""
  alternate_domain_names = local.use_custom_domain ? ["${var.project_name}.${var.domain_name}"] : []
  allow_public_website_access = var.allow_public_website_access
}

# ECS Fargate module
module "ecs_fargate" {
  count  = var.images_ready ? 1 : 0
  source = "../../../modules/ecs_fargate"

  project_name = var.project_name
  environment  = var.environment
  region       = var.region

  # VPC and networking (using new VPC module)
  vpc_id             = module.vpc.vpc_id
  public_subnet_ids  = module.vpc.public_subnet_ids   # For ALB and ECS tasks
  # private_subnet_ids not set - ECS will use public subnets

  # ECS configuration
  ecr_repository_url  = module.ecr.story_generator_repository_url
  ecs_image_tag       = var.ecs_image_tag
  ecs_container_image = var.ecs_container_image
  ecs_desired_count   = var.ecs_desired_count
  ecs_cpu             = var.ecs_cpu
  ecs_memory          = var.ecs_memory

  # Integration with existing resources
  cognito_user_pool_id  = module.cognito.user_pool_id
  cognito_user_pool_arn = module.cognito.user_pool_arn
  cognito_client_id     = module.cognito.user_pool_client_id
  s3_bucket_name        = module.s3_storage.bucket_name
  s3_bucket_arn         = module.s3_storage.bucket_arn
  dynamodb_table_name   = module.dynamodb.table_name
  dynamodb_table_arn    = module.dynamodb.table_arn

  # Application configuration
  tech42_tts_api_url      = var.tech42_tts_api_url
  tech42_tts_api_key      = var.tech42_tts_api_key
  tech42_tts_default_voice = var.tech42_tts_default_voice
  bedrock_model_id       = var.bedrock_model_id
  bedrock_max_tokens     = var.bedrock_max_tokens
  bedrock_image_model_id = var.bedrock_image_model_id
  bedrock_image_region   = var.bedrock_image_region
  cors_origins           = var.cors_origins
  log_level              = var.log_level
}

# NOTE: Create a public Route53 Hosted Zone (only if custom domain is enabled)
resource "aws_route53_zone" "public_zone" {
  count = local.use_custom_domain ? 1 : 0

  name          = "${var.project_name}.${var.domain_name}"
  comment       = "Public hosted zone for ${var.project_name}.${var.domain_name}"
  force_destroy = false 
}

# ACM Certificate Validation Records
resource "aws_route53_record" "cert_validation" {
  for_each = local.use_custom_domain ? {
    for dvo in module.cloudfront.acm_certificate_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id         = aws_route53_zone.public_zone[0].zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

# CloudFront Alias Record - www (primary)
resource "aws_route53_record" "cloudfront_alias_www" {
  count = local.use_custom_domain ? 1 : 0

  zone_id = aws_route53_zone.public_zone[0].zone_id
  name    = "www.${var.project_name}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.cloudfront.cloudfront_domain_name
    zone_id                = module.cloudfront.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

# CloudFront Alias Record - non-www (alternate)
resource "aws_route53_record" "cloudfront_alias" {
  count = local.use_custom_domain ? 1 : 0

  zone_id = aws_route53_zone.public_zone[0].zone_id
  name    = "${var.project_name}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.cloudfront.cloudfront_domain_name
    zone_id                = module.cloudfront.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}