#######################################
# ECS Cluster Outputs
#######################################
output "cluster_id" {
  description = "ID of the ECS cluster"
  value       = module.ecs.cluster_id
}

output "cluster_name" {
  description = "Name of the ECS cluster"
  value       = module.ecs.cluster_name
}

output "cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = module.ecs.cluster_arn
}

#######################################
# ECS Service Outputs
#######################################
output "service_id" {
  description = "ID of the ECS service"
  value       = module.ecs.services["story-generator"].id
}

output "service_name" {
  description = "Name of the ECS service"
  value       = module.ecs.services["story-generator"].name
}

output "task_definition_arn" {
  description = "ARN of the task definition"
  value       = module.ecs.services["story-generator"].task_definition_arn
}

#######################################
# ALB Outputs
#######################################
output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = module.alb.dns_name
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = module.alb.arn
}

output "alb_zone_id" {
  description = "Zone ID of the Application Load Balancer"
  value       = module.alb.zone_id
}

output "target_group_arn" {
  description = "ARN of the target group"
  value       = aws_lb_target_group.ecs.arn
}

#######################################
# ECR Outputs (passthrough from ecr module)
#######################################
output "ecr_repository_url" {
  description = "URL of the ECR repository"
  value       = var.ecr_repository_url
}

output "ecr_repository_name" {
  description = "Name of the ECR repository"
  value       = "${var.project_name}-story-generator-${var.environment}"
}

#######################################
# Security Group Outputs
#######################################
output "ecs_service_security_group_id" {
  description = "ID of the ECS service security group"
  value       = aws_security_group.ecs_service.id
}

output "alb_security_group_id" {
  description = "ID of the ALB security group"
  value       = module.alb.security_group_id
}

#######################################
# CloudWatch Outputs
#######################################
output "log_group_name" {
  description = "Name of the CloudWatch log group"
  value       = aws_cloudwatch_log_group.ecs.name
}

output "log_group_arn" {
  description = "ARN of the CloudWatch log group"
  value       = aws_cloudwatch_log_group.ecs.arn
}

#######################################
# Service Endpoint
#######################################
output "service_endpoint" {
  description = "HTTP endpoint to access the service"
  value       = "http://${module.alb.dns_name}"
}

#######################################
# Deployment Status
#######################################
output "desired_count" {
  description = "Current desired count of ECS tasks"
  value       = var.ecs_desired_count
}

output "container_image" {
  description = "Container image URI being used"
  value       = local.container_image
}

#######################################
# IAM Role Outputs
#######################################
output "task_role_arn" {
  description = "ARN of the ECS Task Role (used by application)"
  value       = aws_iam_role.ecs_task_role.arn
}

output "task_role_name" {
  description = "Name of the ECS Task Role"
  value       = aws_iam_role.ecs_task_role.name
}

output "task_execution_role_arn" {
  description = "ARN of the ECS Task Execution Role (used by ECS agent)"
  value       = aws_iam_role.ecs_task_execution_role.arn
}

output "task_execution_role_name" {
  description = "Name of the ECS Task Execution Role"
  value       = aws_iam_role.ecs_task_execution_role.name
}

