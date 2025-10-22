# VPC Module

Este módulo crea una VPC completa con subnets públicas, privadas, NAT Gateway y VPC Endpoints para ECS Fargate.

## 🏗️ Arquitectura

```
VPC: 10.100.0.0/16
│
├── Public Subnets (ALB)
│   ├── 10.100.1.0/24 (us-east-1a) → Internet Gateway
│   └── 10.100.2.0/24 (us-east-1b) → Internet Gateway
│
├── Private Subnets (ECS Tasks)
│   ├── 10.100.11.0/24 (us-east-1a) → NAT Gateway
│   └── 10.100.12.0/24 (us-east-1b) → NAT Gateway
│
├── NAT Gateway (in public subnet)
│   └── Elastic IP
│
├── Internet Gateway
│
└── VPC Endpoints (Interface & Gateway)
    ├── ECR API (com.amazonaws.us-east-1.ecr.api)
    ├── ECR Docker (com.amazonaws.us-east-1.ecr.dkr)
    ├── S3 (Gateway - no charge)
    └── CloudWatch Logs (com.amazonaws.us-east-1.logs)
```

## 🔧 Componentes Creados

### Networking
- **VPC** con DNS habilitado
- **2 Subnets Públicas** (para ALB)
- **2 Subnets Privadas** (para ECS Tasks)
- **Internet Gateway** (para tráfico público)
- **NAT Gateway** con Elastic IP (para acceso de subnets privadas a internet)
- **Route Tables** configuradas correctamente

### VPC Endpoints
- **ECR API Endpoint** - Para autenticación y API de ECR
- **ECR Docker Endpoint** - Para pull de imágenes Docker
- **S3 Gateway Endpoint** - Para almacenamiento (sin cargo)
- **CloudWatch Logs Endpoint** - Para envío de logs

### Security
- **Security Group para VPC Endpoints** - Permite HTTPS (443) desde la VPC
- **VPC Flow Logs** - Para debugging y auditoría

## 📋 Variables de Entrada

| Variable | Descripción | Default |
|----------|-------------|---------|
| `project_name` | Nombre del proyecto | - |
| `environment` | Entorno (dev, prod) | - |
| `region` | Región AWS | `us-east-1` |
| `vpc_cidr` | CIDR de la VPC | `10.100.0.0/16` |
| `availability_zones` | Lista de AZs | `["us-east-1a", "us-east-1b"]` |
| `public_subnet_cidrs` | CIDRs de subnets públicas | `["10.100.1.0/24", "10.100.2.0/24"]` |
| `private_subnet_cidrs` | CIDRs de subnets privadas | `["10.100.11.0/24", "10.100.12.0/24"]` |
| `enable_nat_gateway` | Habilitar NAT Gateway | `true` |
| `single_nat_gateway` | Usar un solo NAT Gateway | `true` (dev) |
| `enable_vpc_endpoints` | Habilitar VPC Endpoints | `true` |

## 📤 Outputs

### VPC
- `vpc_id` - ID de la VPC
- `vpc_cidr` - CIDR block de la VPC

### Subnets
- `public_subnet_ids` - IDs de subnets públicas (usar para ALB)
- `private_subnet_ids` - IDs de subnets privadas (usar para ECS)
- `public_subnet_cidrs` - CIDRs de subnets públicas
- `private_subnet_cidrs` - CIDRs de subnets privadas

### Networking
- `nat_gateway_ids` - IDs de NAT Gateways
- `nat_public_ips` - IPs públicas elásticas de NAT Gateways
- `igw_id` - ID del Internet Gateway

### VPC Endpoints
- `vpc_endpoint_ecr_api_id` - ID del endpoint de ECR API
- `vpc_endpoint_ecr_dkr_id` - ID del endpoint de ECR Docker
- `vpc_endpoint_s3_id` - ID del endpoint de S3
- `vpc_endpoint_logs_id` - ID del endpoint de CloudWatch Logs
- `vpc_endpoints_security_group_id` - ID del SG de VPC endpoints

## 🚀 Uso

```hcl
module "vpc" {
  source = "../../modules/vpc"

  project_name = "my-project"
  environment  = "dev"
  region       = "us-east-1"
  
  # Network configuration
  vpc_cidr             = "10.100.0.0/16"
  availability_zones   = ["us-east-1a", "us-east-1b"]
  public_subnet_cidrs  = ["10.100.1.0/24", "10.100.2.0/24"]
  private_subnet_cidrs = ["10.100.11.0/24", "10.100.12.0/24"]
  
  # Cost optimization for dev
  single_nat_gateway = true
  
  # Enable VPC Endpoints (recommended)
  enable_vpc_endpoints = true
}

# Usar las subnets en ECS
module "ecs_fargate" {
  source = "../../modules/ecs_fargate"
  
  vpc_id             = module.vpc.vpc_id
  public_subnet_ids  = module.vpc.public_subnet_ids   # ALB
  private_subnet_ids = module.vpc.private_subnet_ids  # ECS Tasks
  # ...
}
```

## 💰 Costos

### NAT Gateway
- **Single NAT Gateway (Dev)**: ~$32/mes + data transfer
- **Multi-AZ NAT Gateway (Prod)**: ~$64/mes + data transfer

### VPC Endpoints (Interface)
- **Cada endpoint**: ~$7.20/mes + $0.01/GB
- **3 endpoints** (ECR API, ECR Docker, Logs): ~$21.60/mes

### VPC Endpoints (Gateway)
- **S3 Gateway**: **GRATIS** ✅

### Alternativa sin VPC Endpoints
Si desactivas VPC Endpoints (`enable_vpc_endpoints = false`):
- **Costo**: Solo NAT Gateway (~$32/mes) + data transfer
- **Desventaja**: Todo el tráfico ECR/S3 pasa por NAT (más lento, más caro en data transfer)

## 🔒 Seguridad

### Mejores Prácticas Implementadas

✅ **ECS Tasks en Subnets Privadas** - No expuestos directamente a internet  
✅ **VPC Endpoints** - Tráfico ECR/S3 se mantiene en AWS backbone (más seguro)  
✅ **Security Groups restrictivos** - Solo puertos necesarios  
✅ **VPC Flow Logs** - Auditoría de tráfico de red  
✅ **DNS habilitado** - Resolución de nombres AWS  
✅ **NAT Gateway** - Acceso controlado a internet desde subnets privadas

## 📊 Flujo de Tráfico

### Incoming (Internet → ALB → ECS)
```
Internet
  ↓
Internet Gateway
  ↓
Public Subnet (ALB)
  ↓
Security Group (ALB → ECS:8000)
  ↓
Private Subnet (ECS Tasks)
```

### Outgoing ECR (ECS → ECR)
```
Private Subnet (ECS Tasks)
  ↓
VPC Endpoint ECR (Interface)
  ↓
AWS ECR Service (sin salir a internet) ✅
```

### Outgoing S3 (ECS → S3)
```
Private Subnet (ECS Tasks)
  ↓
VPC Endpoint S3 (Gateway)
  ↓
AWS S3 Service (sin salir a internet) ✅
```

### Outgoing Internet (ECS → APIs externas)
```
Private Subnet (ECS Tasks)
  ↓
NAT Gateway
  ↓
Internet Gateway
  ↓
Internet (Tech42 TTS, etc.)
```

## 🔧 Troubleshooting

### Error: "unable to pull secrets or registry auth"
**Causa**: ECS no puede alcanzar ECR  
**Solución**: Verifica VPC Endpoints o NAT Gateway están funcionando

```bash
# Verificar VPC Endpoints
aws ec2 describe-vpc-endpoints --filters "Name=vpc-id,Values=<vpc-id>"

# Verificar NAT Gateway
aws ec2 describe-nat-gateways --filter "Name=vpc-id,Values=<vpc-id>"
```

### Error: "i/o timeout" al conectar a ECR
**Causa**: Route tables mal configuradas  
**Solución**: Verifica que las route tables de subnets privadas apunten al NAT Gateway

```bash
# Ver route tables
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=<vpc-id>"
```

## 📈 Escalabilidad

**Espacio Reservado para Crecimiento:**

```
10.100.0.0/16 = 65,536 IPs totales

Usado:
├── Public:  10.100.1-2.0/24   = 512 IPs
└── Private: 10.100.11-12.0/24 = 512 IPs

Disponible para expansión:
├── Public futuras:  10.100.3-10.0/24   = 2,048 IPs
├── Private futuras: 10.100.13-30.0/24  = 4,608 IPs
└── Otros usos:      10.100.31-255.0/24 = 57,600+ IPs
```

## 🎯 Producción vs Desarrollo

### Development
```hcl
single_nat_gateway = true   # $32/mes
enable_vpc_endpoints = true # $21/mes
Total: ~$53/mes
```

### Production
```hcl
single_nat_gateway = false  # $64/mes (2 NAT Gateways)
enable_vpc_endpoints = true # $21/mes
Total: ~$85/mes
```

**Recomendación**: En producción usar 2 NAT Gateways (uno por AZ) para alta disponibilidad.

