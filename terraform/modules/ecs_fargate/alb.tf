#######################################
# Target Group (Manual for full control)
#######################################
resource "aws_lb_target_group" "ecs" {
  name_prefix = "ecs-"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"
  
  deregistration_delay = 10

  health_check {
    enabled             = true
    path                = "/health"
    protocol            = "HTTP"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }

  stickiness {
    enabled = false
    type    = "lb_cookie"
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-ecs-tg-${var.environment}"
      Environment = var.environment
      Project     = var.project_name
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

#######################################
# Application Load Balancer Module
#######################################
module "alb" {
  source  = "terraform-aws-modules/alb/aws"
  version = "~> 9.0"

  name               = "${var.project_name}-alb-${var.environment}"
  load_balancer_type = "application"
  
  vpc_id  = var.vpc_id
  subnets = var.public_subnet_ids

  # Enable deletion protection for production
  enable_deletion_protection = false

  # Security group rules for ALB
  security_group_ingress_rules = {
    all_http = {
      from_port   = 80
      to_port     = 80
      ip_protocol = "tcp"
      cidr_ipv4   = "0.0.0.0/0"
      description = "Allow HTTP from anywhere"
    }
  }

  security_group_egress_rules = {
    all = {
      ip_protocol = "-1"
      cidr_ipv4   = "0.0.0.0/0"
      description = "Allow all outbound traffic"
    }
  }

  # HTTP Listener pointing to manual target group
  listeners = {
    http = {
      port     = 80
      protocol = "HTTP"

      forward = {
        arn = aws_lb_target_group.ecs.arn
      }
    }
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-alb-${var.environment}"
      Environment = var.environment
      Project     = var.project_name
    }
  )
}

