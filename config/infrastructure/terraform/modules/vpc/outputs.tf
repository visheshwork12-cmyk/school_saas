# config/infrastructure/terraform/modules/vpc/outputs.tf

# VPC Outputs
output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_arn" {
  description = "ARN of the VPC"
  value       = aws_vpc.main.arn
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "vpc_ipv6_cidr_block" {
  description = "IPv6 CIDR block of the VPC"
  value       = aws_vpc.main.ipv6_cidr_block
}

output "vpc_enable_dns_support" {
  description = "Whether DNS support is enabled in the VPC"
  value       = aws_vpc.main.enable_dns_support
}

output "vpc_enable_dns_hostnames" {
  description = "Whether DNS hostnames are enabled in the VPC"
  value       = aws_vpc.main.enable_dns_hostnames
}

# Internet Gateway
output "igw_id" {
  description = "ID of the Internet Gateway"
  value       = aws_internet_gateway.main.id
}

output "igw_arn" {
  description = "ARN of the Internet Gateway"
  value       = aws_internet_gateway.main.arn
}

# Subnet Outputs - Public
output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "public_subnet_arns" {
  description = "List of public subnet ARNs"
  value       = aws_subnet.public[*].arn
}

output "public_subnet_cidrs" {
  description = "List of public subnet CIDR blocks"
  value       = aws_subnet.public[*].cidr_block
}

output "public_subnet_azs" {
  description = "List of public subnet availability zones"
  value       = aws_subnet.public[*].availability_zone
}

# Subnet Outputs - Private
output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = aws_subnet.private[*].id
}

output "private_subnet_arns" {
  description = "List of private subnet ARNs"
  value       = aws_subnet.private[*].arn
}

output "private_subnet_cidrs" {
  description = "List of private subnet CIDR blocks"
  value       = aws_subnet.private[*].cidr_block
}

output "private_subnet_azs" {
  description = "List of private subnet availability zones"
  value       = aws_subnet.private[*].availability_zone
}

# Subnet Outputs - Database
output "database_subnet_ids" {
  description = "List of database subnet IDs"
  value       = aws_subnet.database[*].id
}

output "database_subnet_arns" {
  description = "List of database subnet ARNs"
  value       = aws_subnet.database[*].arn
}

output "database_subnet_cidrs" {
  description = "List of database subnet CIDR blocks"
  value       = aws_subnet.database[*].cidr_block
}

output "database_subnet_azs" {
  description = "List of database subnet availability zones"
  value       = aws_subnet.database[*].availability_zone
}

# Subnet Groups
output "database_subnet_group_name" {
  description = "Name of the database subnet group"
  value       = length(aws_db_subnet_group.main) > 0 ? aws_db_subnet_group.main[0].name : null
}

output "database_subnet_group_id" {
  description = "ID of the database subnet group"
  value       = length(aws_db_subnet_group.main) > 0 ? aws_db_subnet_group.main[0].id : null
}

output "database_subnet_group_arn" {
  description = "ARN of the database subnet group"
  value       = length(aws_db_subnet_group.main) > 0 ? aws_db_subnet_group.main[0].arn : null
}

output "elasticache_subnet_group_name" {
  description = "Name of the ElastiCache subnet group"
  value       = length(aws_elasticache_subnet_group.main) > 0 ? aws_elasticache_subnet_group.main[0].name : null
}

output "elasticache_subnet_group_id" {
  description = "ID of the ElastiCache subnet group"
  value       = length(aws_elasticache_subnet_group.main) > 0 ? aws_elasticache_subnet_group.main[0].id : null
}

# NAT Gateway Outputs
output "nat_gateway_ids" {
  description = "List of NAT Gateway IDs"
  value       = aws_nat_gateway.main[*].id
}

output "nat_gateway_public_ips" {
  description = "List of NAT Gateway public IP addresses"
  value       = aws_nat_gateway.main[*].public_ip
}

output "elastic_ip_ids" {
  description = "List of Elastic IP IDs for NAT Gateways"
  value       = aws_eip.nat[*].id
}

output "elastic_ip_public_ips" {
  description = "List of Elastic IP public addresses"
  value       = aws_eip.nat[*].public_ip
}

# Route Table Outputs
output "public_route_table_id" {
  description = "ID of the public route table"
  value       = aws_route_table.public.id
}

output "private_route_table_ids" {
  description = "List of private route table IDs"
  value       = aws_route_table.private[*].id
}

output "database_route_table_id" {
  description = "ID of the database route table"
  value       = length(aws_route_table.database) > 0 ? aws_route_table.database[0].id : null
}

# VPC Endpoint Outputs
output "s3_vpc_endpoint_id" {
  description = "ID of the S3 VPC endpoint"
  value       = length(aws_vpc_endpoint.s3) > 0 ? aws_vpc_endpoint.s3[0].id : null
}

output "dynamodb_vpc_endpoint_id" {
  description = "ID of the DynamoDB VPC endpoint"
  value       = length(aws_vpc_endpoint.dynamodb) > 0 ? aws_vpc_endpoint.dynamodb[0].id : null
}

# Flow Log Outputs
output "flow_log_id" {
  description = "ID of the VPC Flow Log"
  value       = length(aws_flow_log.main) > 0 ? aws_flow_log.main[0].id : null
}

output "flow_log_arn" {
  description = "ARN of the VPC Flow Log"
  value       = length(aws_flow_log.main) > 0 ? aws_flow_log.main[0].arn : null
}

# Network ACL Outputs
output "public_network_acl_id" {
  description = "ID of the public Network ACL"
  value       = length(aws_network_acl.public) > 0 ? aws_network_acl.public[0].id : null
}

output "private_network_acl_id" {
  description = "ID of the private Network ACL"
  value       = length(aws_network_acl.private) > 0 ? aws_network_acl.private[0].id : null
}

# Availability Zones
output "availability_zones" {
  description = "List of availability zones used"
  value       = local.availability_zones
}

output "azs" {
  description = "List of availability zones used (alias)"
  value       = local.availability_zones
}

# Subnet mappings for easy reference
output "subnet_mapping" {
  description = "Mapping of subnet types to their IDs and AZs"
  value = {
    public = {
      ids  = aws_subnet.public[*].id
      azs  = aws_subnet.public[*].availability_zone
      cidrs = aws_subnet.public[*].cidr_block
    }
    private = {
      ids  = aws_subnet.private[*].id
      azs  = aws_subnet.private[*].availability_zone
      cidrs = aws_subnet.private[*].cidr_block
    }
    database = {
      ids  = aws_subnet.database[*].id
      azs  = aws_subnet.database[*].availability_zone
      cidrs = aws_subnet.database[*].cidr_block
    }
  }
}

# Tags
output "tags" {
  description = "Tags applied to the VPC"
  value       = aws_vpc.main.tags_all
}

# Network Configuration Summary
output "network_config" {
  description = "Summary of network configuration"
  value = {
    vpc_id           = aws_vpc.main.id
    vpc_cidr         = aws_vpc.main.cidr_block
    availability_zones = local.availability_zones
    nat_gateway_enabled = local.final_enable_nat_gateway
    single_nat_gateway = local.final_single_nat_gateway
    public_subnets   = length(aws_subnet.public)
    private_subnets  = length(aws_subnet.private)
    database_subnets = length(aws_subnet.database)
  }
}
