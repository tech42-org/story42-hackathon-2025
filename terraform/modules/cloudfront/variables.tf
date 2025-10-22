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

variable "cloudfront_price_class" {
  description = "CloudFront distribution price class"
  type        = string
  default     = "PriceClass_100"
  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.cloudfront_price_class)
    error_message = "Price class must be PriceClass_100, PriceClass_200, or PriceClass_All"
  }
}

variable "enable_versioning" {
  description = "Enable S3 bucket versioning"
  type        = bool
  default     = false
}

variable "allow_public_website_access" {
  description = "Allow direct public access to the static website bucket"
  type        = bool
  default     = false
}

variable "domain_name" {
  description = "Primary domain name for the CloudFront distribution"
  type        = string
  default     = ""
}

variable "alternate_domain_names" {
  description = "List of alternate domain names (CNAMEs) for CloudFront"
  type        = list(string)
  default     = []
}

variable "acm_certificate_arn" {
  description = "ARN of the ACM certificate to use for HTTPS (must be in us-east-1 for CloudFront)"
  type        = string
  default     = ""
}


