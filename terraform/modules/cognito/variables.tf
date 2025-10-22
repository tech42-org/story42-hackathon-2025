variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
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

