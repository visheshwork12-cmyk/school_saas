# config/infrastructure/terraform/modules/vpc/main.tf
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

# Local values
locals {
  # Use provided AZs or auto-detect
  availability_zones = length(var.availability_zones) > 0 ? var.availability_zones : slice(data.aws_availability_zones.available.names, 0, var.max_azs)
  
  # Calculate subnet count
  az_count = length(local.availability_zones)
  
  # Environment-specific configurations
  environment_config = {
    development = {
      enable_dns_hostnames = true
      enable_dns_support   = true
      enable_nat_gateway   = false
      single_nat_gateway   = true
      one_nat_gateway_per_az = false
    }
    staging = {
      enable_dns_hostnames = true
      enable_dns_support   = true
      enable_nat_gateway   = true
      single_nat_gateway   = true
      one_nat_gateway_per_az = false
    }
    production = {
      enable_dns_hostnames = true
      enable_dns_support   = true
      enable_nat_gateway   = true
      single_nat_gateway   = false
      one_nat_gateway_per_az = true
    }
  }
  
  config = local.environment_config[var.environment]
  
  # Final configurations with variable overrides
  final_enable_nat_gateway     = var.enable_nat_gateway != null ? var.enable_nat_gateway : local.config.enable_nat_gateway
  final_single_nat_gateway     = var.single_nat_gateway != null ? var.single_nat_gateway : local.config.single_nat_gateway
  final_one_nat_gateway_per_az = var.one_nat_gateway_per_az != null ? var.one_nat_gateway_per_az : local.config.one_nat_gateway_per_az
  
  common_tags = merge(var.tags, {
    Environment = var.environment
    ManagedBy   = "terraform"
    Module      = "vpc"
  })
}

# VPC
resource "aws_vpc" "main" {
  cidr_block = var.cidr_block
  
  enable_dns_hostnames             = local.config.enable_dns_hostnames
  enable_dns_support              = local.config.enable_dns_support
  assign_generated_ipv6_cidr_block = var.enable_ipv6
  enable_network_address_usage_metrics = var.enable_network_address_usage_metrics
  
  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-vpc"
  })
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  
  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-igw"
  })
}

# Elastic IPs for NAT Gateways
resource "aws_eip" "nat" {
  count = local.final_enable_nat_gateway ? (local.final_single_nat_gateway ? 1 : local.az_count) : 0
  
  domain     = "vpc"
  depends_on = [aws_internet_gateway.main]
  
  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-nat-eip-${count.index + 1}"
  })
}

# Public Subnets
resource "aws_subnet" "public" {
  count = length(var.public_subnet_cidrs)
  
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = local.availability_zones[count.index % local.az_count]
  map_public_ip_on_launch = var.map_public_ip_on_launch
  
  # IPv6 support
  ipv6_cidr_block                 = var.enable_ipv6 ? cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, count.index) : null
  assign_ipv6_address_on_creation = var.enable_ipv6 ? var.assign_ipv6_address_on_creation : false
  
  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-public-${count.index + 1}"
    Type = "public"
    AZ   = local.availability_zones[count.index % local.az_count]
    "kubernetes.io/role/elb" = "1"
  })
}

# Private Subnets
resource "aws_subnet" "private" {
  count = length(var.private_subnet_cidrs)
  
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = local.availability_zones[count.index % local.az_count]
  
  # IPv6 support
  ipv6_cidr_block                 = var.enable_ipv6 ? cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, count.index + length(var.public_subnet_cidrs)) : null
  assign_ipv6_address_on_creation = false # Private subnets typically don't need IPv6 auto-assignment
  
  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-private-${count.index + 1}"
    Type = "private"
    AZ   = local.availability_zones[count.index % local.az_count]
    "kubernetes.io/role/internal-elb" = "1"
  })
}

# Database Subnets
resource "aws_subnet" "database" {
  count = length(var.database_subnet_cidrs)
  
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.database_subnet_cidrs[count.index]
  availability_zone = local.availability_zones[count.index % local.az_count]
  
  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-database-${count.index + 1}"
    Type = "database"
    AZ   = local.availability_zones[count.index % local.az_count]
  })
}

# NAT Gateways
resource "aws_nat_gateway" "main" {
  count = local.final_enable_nat_gateway ? (local.final_single_nat_gateway ? 1 : local.az_count) : 0
  
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index % length(aws_subnet.public)].id
  
  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-nat-${count.index + 1}"
  })
  
  depends_on = [aws_internet_gateway.main]
}

# Route Tables - Public
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  
  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-public-rt"
    Type = "public"
  })
}

# Public Route - Internet Gateway
resource "aws_route" "public_internet_gateway" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
  
  timeouts {
    create = "5m"
  }
}

# IPv6 Route for public subnets
resource "aws_route" "public_internet_gateway_ipv6" {
  count = var.enable_ipv6 ? 1 : 0
  
  route_table_id              = aws_route_table.public.id
  destination_ipv6_cidr_block = "::/0"
  gateway_id                  = aws_internet_gateway.main.id
  
  timeouts {
    create = "5m"
  }
}

# Public Route Table Associations
resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)
  
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Route Tables - Private
resource "aws_route_table" "private" {
  count = local.final_enable_nat_gateway ? (local.final_single_nat_gateway ? 1 : local.az_count) : 1
  
  vpc_id = aws_vpc.main.id
  
  tags = merge(local.common_tags, {
    Name = local.final_enable_nat_gateway ? 
           "${var.name_prefix}-private-rt-${count.index + 1}" : 
           "${var.name_prefix}-private-rt"
    Type = "private"
  })
}

# Private Routes - NAT Gateway
resource "aws_route" "private_nat_gateway" {
  count = local.final_enable_nat_gateway ? length(aws_route_table.private) : 0
  
  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = local.final_single_nat_gateway ? aws_nat_gateway.main[0].id : aws_nat_gateway.main[count.index].id
  
  timeouts {
    create = "5m"
  }
}

# Private Route Table Associations
resource "aws_route_table_association" "private" {
  count = length(aws_subnet.private)
  
  subnet_id = aws_subnet.private[count.index].id
  route_table_id = local.final_enable_nat_gateway ? 
                   (local.final_single_nat_gateway ? 
                    aws_route_table.private[0].id : 
                    aws_route_table.private[count.index % length(aws_route_table.private)].id) :
                   aws_route_table.private[0].id
}

# Database Route Table
resource "aws_route_table" "database" {
  count = length(var.database_subnet_cidrs) > 0 ? 1 : 0
  
  vpc_id = aws_vpc.main.id
  
  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-database-rt"
    Type = "database"
  })
}

# Database Route Table Associations
resource "aws_route_table_association" "database" {
  count = length(aws_subnet.database)
  
  subnet_id      = aws_subnet.database[count.index].id
  route_table_id = aws_route_table.database[0].id
}

# Database Subnet Group
resource "aws_db_subnet_group" "main" {
  count = length(var.database_subnet_cidrs) > 0 ? 1 : 0
  
  name       = "${var.name_prefix}-db-subnet-group"
  subnet_ids = aws_subnet.database[*].id
  
  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-db-subnet-group"
  })
}

# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "main" {
  count = var.create_elasticache_subnet_group && length(var.private_subnet_cidrs) > 0 ? 1 : 0
  
  name       = "${var.name_prefix}-cache-subnet-group"
  subnet_ids = aws_subnet.private[*].id
  
  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-cache-subnet-group"
  })
}

# VPC Endpoints
resource "aws_vpc_endpoint" "s3" {
  count = var.enable_s3_endpoint ? 1 : 0
  
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${data.aws_region.current.name}.s3"
  
  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-s3-endpoint"
  })
}

resource "aws_vpc_endpoint_route_table_association" "s3_private" {
  count = var.enable_s3_endpoint ? length(aws_route_table.private) : 0
  
  vpc_endpoint_id = aws_vpc_endpoint.s3[0].id
  route_table_id  = aws_route_table.private[count.index].id
}

resource "aws_vpc_endpoint_route_table_association" "s3_database" {
  count = var.enable_s3_endpoint && length(aws_route_table.database) > 0 ? 1 : 0
  
  vpc_endpoint_id = aws_vpc_endpoint.s3[0].id
  route_table_id  = aws_route_table.database[0].id
}

resource "aws_vpc_endpoint" "dynamodb" {
  count = var.enable_dynamodb_endpoint ? 1 : 0
  
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${data.aws_region.current.name}.dynamodb"
  
  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-dynamodb-endpoint"
  })
}

resource "aws_vpc_endpoint_route_table_association" "dynamodb_private" {
  count = var.enable_dynamodb_endpoint ? length(aws_route_table.private) : 0
  
  vpc_endpoint_id = aws_vpc_endpoint.dynamodb[0].id
  route_table_id  = aws_route_table.private[count.index].id
}

# VPC Flow Logs
resource "aws_flow_log" "main" {
  count = var.enable_flow_log ? 1 : 0
  
  iam_role_arn    = var.flow_log_destination_type == "cloud-watch-logs" ? aws_iam_role.flow_log[0].arn : null
  log_destination = var.flow_log_destination_arn
  log_destination_type = var.flow_log_destination_type
  traffic_type    = var.flow_log_traffic_type
  vpc_id          = aws_vpc.main.id
  
  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-flow-log"
  })
}

# IAM Role for VPC Flow Logs (CloudWatch)
resource "aws_iam_role" "flow_log" {
  count = var.enable_flow_log && var.flow_log_destination_type == "cloud-watch-logs" ? 1 : 0
  
  name_prefix = "${var.name_prefix}-flow-log-"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "vpc-flow-logs.amazonaws.com"
        }
      }
    ]
  })
  
  tags = local.common_tags
}

resource "aws_iam_role_policy" "flow_log" {
  count = var.enable_flow_log && var.flow_log_destination_type == "cloud-watch-logs" ? 1 : 0
  
  name_prefix = "${var.name_prefix}-flow-log-"
  role        = aws_iam_role.flow_log[0].id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Resource = "*"
      }
    ]
  })
}

# Network ACLs - Public
resource "aws_network_acl" "public" {
  count = var.create_network_acls ? 1 : 0
  
  vpc_id     = aws_vpc.main.id
  subnet_ids = aws_subnet.public[*].id
  
  # Allow all outbound traffic
  egress {
    protocol   = "-1"
    rule_no    = 100
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 0
    to_port    = 0
  }
  
  # Allow HTTP
  ingress {
    protocol   = "tcp"
    rule_no    = 100
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 80
    to_port    = 80
  }
  
  # Allow HTTPS
  ingress {
    protocol   = "tcp"
    rule_no    = 110
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 443
    to_port    = 443
  }
  
  # Allow SSH
  ingress {
    protocol   = "tcp"
    rule_no    = 120
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 22
    to_port    = 22
  }
  
  # Allow ephemeral ports for responses
  ingress {
    protocol   = "tcp"
    rule_no    = 130
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 1024
    to_port    = 65535
  }
  
  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-public-nacl"
  })
}

# Network ACLs - Private
resource "aws_network_acl" "private" {
  count = var.create_network_acls ? 1 : 0
  
  vpc_id     = aws_vpc.main.id
  subnet_ids = aws_subnet.private[*].id
  
  # Allow all outbound traffic
  egress {
    protocol   = "-1"
    rule_no    = 100
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 0
    to_port    = 0
  }
  
  # Allow inbound from VPC
  ingress {
    protocol   = "-1"
    rule_no    = 100
    action     = "allow"
    cidr_block = var.cidr_block
    from_port  = 0
    to_port    = 0
  }
  
  # Allow ephemeral ports from internet (for NAT)
  ingress {
    protocol   = "tcp"
    rule_no    = 110
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 1024
    to_port    = 65535
  }
  
  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-private-nacl"
  })
}
