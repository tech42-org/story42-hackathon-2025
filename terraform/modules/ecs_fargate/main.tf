#######################################
# ECS Cluster and Service Module
#######################################

# Local variables for container image management
locals {
  # Use custom image if provided, otherwise use ECR URL from ecr module
  container_image = var.ecs_container_image != "" ? var.ecs_container_image : "${var.ecr_repository_url}:${var.ecs_image_tag}"
}

module "ecs" {
  source  = "terraform-aws-modules/ecs/aws"
  version = "~> 5.11"

  cluster_name = "${var.project_name}-ecs-cluster-${var.environment}"

  # Cluster settings
  cluster_settings = [
    {
      name  = "containerInsights"
      value = "enabled"
    }
  ]

  # Fargate capacity providers
  fargate_capacity_providers = {
    FARGATE = {
      default_capacity_provider_strategy = {
        weight = 1
        base   = 1
      }
    }
  }

  # ECS Services
  services = {
    story-generator = {
      cpu    = tonumber(var.ecs_cpu)
      memory = tonumber(var.ecs_memory)

      # Desired count for running tasks
      desired_count = var.ecs_desired_count

      # Custom IAM Roles
      create_task_exec_iam_role = false
      create_task_exec_policy   = false
      create_tasks_iam_role     = false
      tasks_iam_role_arn        = aws_iam_role.ecs_task_role.arn
      task_exec_iam_role_arn    = aws_iam_role.ecs_task_execution_role.arn

      # Container definitions
      container_definitions = {
        story-generator-container = {
          image     = local.container_image
          cpu       = tonumber(var.ecs_cpu)
          memory    = tonumber(var.ecs_memory)
          essential = true
          
          readonly_root_filesystem = false

          port_mappings = [
            {
              name          = "story-generator"
              containerPort = 8000
              protocol      = "tcp"
            }
          ]

          # CloudWatch Logs
          enable_cloudwatch_logging = true
          log_configuration = {
            logDriver = "awslogs"
            options = {
              "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
              "awslogs-region"        = var.region
              "awslogs-stream-prefix" = "story-generator"
            }
          }

          # Environment variables
          environment = [
            { name = "PORT", value = "8000" },
            { name = "LOG_LEVEL", value = var.log_level },
            { name = "AWS_DEFAULT_REGION", value = var.region },
            { name = "COGNITO_USER_POOL_ID", value = var.cognito_user_pool_id },
            { name = "COGNITO_CLIENT_ID", value = var.cognito_client_id },
            { name = "COGNITO_REGION", value = var.region },
            { name = "AUTH_ENABLED", value = "true" },
            { name = "S3_STORAGE_BUCKET", value = var.s3_bucket_name },
            { name = "S3_BASE_PREFIX", value = "AIWorkflow" },
            { name = "DYNAMODB_SESSIONS_TABLE", value = var.dynamodb_table_name },
            { name = "BEDROCK_MODEL_ID", value = var.bedrock_model_id },
            { name = "BEDROCK_MAX_TOKENS", value = tostring(var.bedrock_max_tokens) },
            { name = "BEDROCK_IMAGE_MODEL_ID", value = var.bedrock_image_model_id },
            { name = "BEDROCK_IMAGE_REGION", value = var.bedrock_image_region },
            { name = "TECH42_TTS_API_URL", value = var.tech42_tts_api_url },
            { name = "TECH42_TTS_API_KEY", value = var.tech42_tts_api_key },
            { name = "TECH42_TTS_DEFAULT_VOICE", value = var.tech42_tts_default_voice },
            { name = "ENVIRONMENT", value = "production" },
            { name = "CORS_ORIGINS", value = var.cors_origins }
          ]
        }
      }

      # Load balancer configuration
      load_balancer = {
        service = {
          target_group_arn = aws_lb_target_group.ecs.arn
          container_name   = "story-generator-container"
          container_port   = 8000
        }
      }

      # Network configuration
      subnet_ids         = length(var.private_subnet_ids) > 0 ? var.private_subnet_ids : var.public_subnet_ids
      security_group_ids = [aws_security_group.ecs_service.id]
      assign_public_ip   = length(var.private_subnet_ids) > 0 ? false : true

      # Task definition requires compatibilities
      requires_compatibilities = ["FARGATE"]
      
      # Deployment configuration
      deployment_minimum_healthy_percent = 100
      deployment_maximum_percent         = 200

      deployment_circuit_breaker = {
        enable   = true
        rollback = true
      }

      # Health check grace period
      health_check_grace_period_seconds = 60
    }
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-ecs-cluster-${var.environment}"
      Environment = var.environment
      Project     = var.project_name
    }
  )
}
