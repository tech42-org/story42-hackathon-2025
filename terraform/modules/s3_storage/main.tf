# S3 bucket for story images
resource "aws_s3_bucket" "story_images" {
  bucket = "${var.project_name}-story-images-${var.environment}"

  tags = {
    Name        = "${var.project_name}-story-images-${var.environment}"
    Environment = var.environment
    Project     = var.project_name
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "story_images" {
  bucket = aws_s3_bucket.story_images.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Disable versioning
resource "aws_s3_bucket_versioning" "story_images" {
  bucket = aws_s3_bucket.story_images.id

  versioning_configuration {
    status = "Disabled"
  }
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "story_images" {
  bucket = aws_s3_bucket.story_images.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Lifecycle policy to manage old images
resource "aws_s3_bucket_lifecycle_configuration" "story_images" {
  bucket = aws_s3_bucket.story_images.id

  rule {
    id     = "delete-old-images"
    status = "Enabled"

    filter {
      prefix = "users/"
    }

    expiration {
      days = 90
    }
  }
}

# CORS configuration for web access
resource "aws_s3_bucket_cors_configuration" "story_images" {
  bucket = aws_s3_bucket.story_images.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

