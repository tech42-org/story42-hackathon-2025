variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
}

variable "google_api_key" {
  description = "Google API Key (optional - can be set manually after creation)"
  type        = string
  default     = ""
  sensitive   = true
}

