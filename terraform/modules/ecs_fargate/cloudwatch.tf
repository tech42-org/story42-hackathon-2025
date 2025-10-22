#######################################
# CloudWatch Log Group for ECS
#######################################
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.project_name}-${var.environment}"
  retention_in_days = 7

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-ecs-logs-${var.environment}"
      Environment = var.environment
      Project     = var.project_name
    }
  )
}

