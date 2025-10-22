output "cloudfront_distribution_id" { 
  description = "ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.website.id
}

output "cloudfront_distribution_arn" {
  description = "ARN of the CloudFront distribution"
  value       = aws_cloudfront_distribution.website.arn
}

output "cloudfront_domain_name" {
  description = "Domain name of the CloudFront distribution"
  value       = aws_cloudfront_distribution.website.domain_name
}

output "cloudfront_hosted_zone_id" {
  description = "CloudFront hosted zone ID for Route 53 alias records"
  value       = aws_cloudfront_distribution.website.hosted_zone_id
}

output "acm_certificate_arn" {
  description = "ARN of the ACM certificate"
  value       = var.domain_name != "" ? aws_acm_certificate.website[0].arn : null
}

output "acm_certificate_validation_options" {
  description = "ACM certificate domain validation options"
  value       = var.domain_name != "" ? aws_acm_certificate.website[0].domain_validation_options : []
}