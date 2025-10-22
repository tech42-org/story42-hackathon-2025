#######################################
# Security Group for ECS Service
#######################################
resource "aws_security_group" "ecs_service" {
  name_prefix = "${var.project_name}-ecs-service-"
  description = "Security group for ECS Service"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-ecs-service-sg-${var.environment}"
      Environment = var.environment
      Project     = var.project_name
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Ingress rule: Allow traffic from ALB
resource "aws_vpc_security_group_ingress_rule" "ecs_from_alb" {
  security_group_id = aws_security_group.ecs_service.id

  description                  = "Allow traffic from ALB"
  from_port                    = 8000
  to_port                      = 8000
  ip_protocol                  = "tcp"
  referenced_security_group_id = module.alb.security_group_id
}

# Egress rule: Allow all outbound
resource "aws_vpc_security_group_egress_rule" "ecs_all_outbound" {
  security_group_id = aws_security_group.ecs_service.id

  description = "Allow all outbound traffic"
  ip_protocol = "-1"
  cidr_ipv4   = "0.0.0.0/0"
}

