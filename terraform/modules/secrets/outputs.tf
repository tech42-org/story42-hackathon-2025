output "google_api_key_secret_arn" {
  description = "ARN of the Google API Key secret"
  value       = aws_secretsmanager_secret.google_api_key.arn
}

output "google_api_key_secret_name" {
  description = "Name of the Google API Key secret"
  value       = aws_secretsmanager_secret.google_api_key.name
}

