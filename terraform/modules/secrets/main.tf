# Secrets Manager secret for Google API Key
resource "aws_secretsmanager_secret" "google_api_key" {
  name                    = "${var.project_name}-google-api-key-${var.environment}"
  description             = "Google API Key for Gemini image generation"
  recovery_window_in_days = 0  # Force immediate deletion (no waiting period)

  tags = {
    Name        = "${var.project_name}-google-api-key-${var.environment}"
    Environment = var.environment
    Project     = var.project_name
  }
}

# Secret version (placeholder - actual value should be set manually or via CI/CD)
resource "aws_secretsmanager_secret_version" "google_api_key" {
  secret_id     = aws_secretsmanager_secret.google_api_key.id
  secret_string = var.google_api_key != "" ? var.google_api_key : "PLACEHOLDER_UPDATE_MANUALLY"

  lifecycle {
    ignore_changes = [secret_string]
  }
}

