#######################################
# ECR Repositories Module
# Creates all ECR repositories for the project
#######################################

# ECR repository for Lambda text generation
resource "aws_ecr_repository" "lambda" {
  name                 = "${var.project_name}-lambda-${var.environment}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "${var.project_name}-lambda-${var.environment}"
    Environment = var.environment
    Project     = var.project_name
  }
}

# ECR lifecycle policy for Lambda text
resource "aws_ecr_lifecycle_policy" "lambda" {
  repository = aws_ecr_repository.lambda.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 5 images"
      selection = {
        tagStatus     = "any"
        countType     = "imageCountMoreThan"
        countNumber   = 5
      }
      action = {
        type = "expire"
      }
    }]
  })
}

# ECR repository for Lambda image generation
resource "aws_ecr_repository" "story_image_lambda" {
  name                 = "${var.project_name}-story-image-lambda-${var.environment}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "${var.project_name}-story-image-lambda-${var.environment}"
    Environment = var.environment
    Project     = var.project_name
  }
}

# ECR lifecycle policy for Lambda image
resource "aws_ecr_lifecycle_policy" "story_image_lambda" {
  repository = aws_ecr_repository.story_image_lambda.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 5 images"
      selection = {
        tagStatus     = "any"
        countType     = "imageCountMoreThan"
        countNumber   = 5
      }
      action = {
        type = "expire"
      }
    }]
  })
}

# ECR repository for ECS story generator
resource "aws_ecr_repository" "story_generator" {
  name                 = "${var.project_name}-story-generator-${var.environment}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "${var.project_name}-story-generator-${var.environment}"
    Environment = var.environment
    Project     = var.project_name
  }
}

# ECR lifecycle policy for ECS
resource "aws_ecr_lifecycle_policy" "story_generator" {
  repository = aws_ecr_repository.story_generator.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 5 images"
      selection = {
        tagStatus     = "any"
        countType     = "imageCountMoreThan"
        countNumber   = 5
      }
      action = {
        type = "expire"
      }
    }]
  })
}

