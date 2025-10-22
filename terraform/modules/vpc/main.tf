#######################################
# VPC Module using Official AWS VPC Module
#######################################
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.project_name}-vpc-${var.environment}"
  cidr = var.vpc_cidr

  azs             = var.availability_zones
  public_subnets  = var.public_subnet_cidrs
  private_subnets = var.private_subnet_cidrs

  # NAT Gateway configuration
  enable_nat_gateway = var.enable_nat_gateway
  single_nat_gateway = var.single_nat_gateway
  
  # For production, use one NAT Gateway per AZ
  one_nat_gateway_per_az = !var.single_nat_gateway

  # DNS configuration (required for ECR and other AWS services)
  enable_dns_hostnames = true
  enable_dns_support   = true

  # VPC Flow Logs (optional, useful for debugging)
  enable_flow_log                      = true
  create_flow_log_cloudwatch_iam_role  = true
  create_flow_log_cloudwatch_log_group = true

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-vpc-${var.environment}"
      Environment = var.environment
      Project     = var.project_name
    }
  )

  public_subnet_tags = {
    Type = "Public"
    Tier = "public"
  }

  private_subnet_tags = {
    Type = "Private"
    Tier = "private"
  }
}

#######################################
# VPC Endpoints for ECR (recommended)
#######################################

# Security Group for VPC Endpoints
resource "aws_security_group" "vpc_endpoints" {
  count = var.enable_vpc_endpoints ? 1 : 0

  name_prefix = "${var.project_name}-vpc-endpoints-"
  description = "Security group for VPC endpoints"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "HTTPS from VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-vpc-endpoints-sg-${var.environment}"
      Environment = var.environment
      Project     = var.project_name
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# ECR API Endpoint
resource "aws_vpc_endpoint" "ecr_api" {
  count = var.enable_vpc_endpoints ? 1 : 0

  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.${var.region}.ecr.api"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true

  subnet_ids         = module.vpc.private_subnets
  security_group_ids = [aws_security_group.vpc_endpoints[0].id]

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-ecr-api-endpoint-${var.environment}"
      Environment = var.environment
      Project     = var.project_name
    }
  )
}

# ECR Docker Endpoint
resource "aws_vpc_endpoint" "ecr_dkr" {
  count = var.enable_vpc_endpoints ? 1 : 0

  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.${var.region}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true

  subnet_ids         = module.vpc.private_subnets
  security_group_ids = [aws_security_group.vpc_endpoints[0].id]

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-ecr-dkr-endpoint-${var.environment}"
      Environment = var.environment
      Project     = var.project_name
    }
  )
}

# S3 Gateway Endpoint (no charge, recommended)
resource "aws_vpc_endpoint" "s3" {
  count = var.enable_vpc_endpoints ? 1 : 0

  vpc_id            = module.vpc.vpc_id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = module.vpc.private_route_table_ids

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-s3-endpoint-${var.environment}"
      Environment = var.environment
      Project     = var.project_name
    }
  )
}

# CloudWatch Logs Endpoint (for ECS logs)
resource "aws_vpc_endpoint" "logs" {
  count = var.enable_vpc_endpoints ? 1 : 0

  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.${var.region}.logs"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true

  subnet_ids         = module.vpc.private_subnets
  security_group_ids = [aws_security_group.vpc_endpoints[0].id]

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-logs-endpoint-${var.environment}"
      Environment = var.environment
      Project     = var.project_name
    }
  )
}

