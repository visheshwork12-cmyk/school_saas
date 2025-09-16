# config/infrastructure/terraform/modules/vpc/variables.tf

# Basic Configuration
variable "name_prefix" {
  description = "Name prefix for all resources"
  type        = string
}

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

# VPC Configuration
variable "cidr_block" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
  validation {
    condition     = can(cidrhost(var.cidr_block, 0))
    error_message = "Invalid CIDR block format."
  }
}

variable "enable_ipv6" {
  description = "Enable IPv6 support"
  type        = bool
  default     = false
}

variable "enable_network_address_usage_metrics" {
  description = "Enable network address usage metrics"
  type        = bool
  default     = false
}

# Subnet Configuration
variable "availability_zones" {
  description = "List of availability zones to use (leave empty for auto-detection)"
  type        = list(string)
  default     = []
}

variable "max_azs" {
  description = "Maximum number of AZs to use when auto-detecting"
  type        = number
  default     = 3
  validation {
    condition     = var.max_azs >= 2 && var.max_azs <= 6
    error_message = "max_azs must be between 2 and 6."
  }
}

variable "public_subnet_cidrs" {
  description = "List of CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "private_subnet_cidrs" {
  description = "List of CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.20.0/24", "10.0.30.0/24"]
}

variable "database_subnet_cidrs" {
  description = "List of CIDR blocks for database subnets"
  type        = list(string)
  default     = ["10.0.50.0/24", "10.0.60.0/24", "10.0.70.0/24"]
}

variable "map_public_ip_on_launch" {
  description = "Auto-assign public IP on launch for public subnets"
  type        = bool
  default     = true
}

variable "assign_ipv6_address_on_creation" {
  description = "Auto-assign IPv6 address on creation"
  type        = bool
  default     = false
}

# NAT Gateway Configuration
variable "enable_nat_gateway" {
  description = "Enable NAT Gateway for private subnets"
  type        = bool
  default     = null # Will use environment-specific default if not specified
}

variable "single_nat_gateway" {
  description = "Use single NAT Gateway for all private subnets (cost optimization)"
  type        = bool
  default     = null # Will use environment-specific default if not specified
}

variable "one_nat_gateway_per_az" {
  description = "Use one NAT Gateway per AZ (high availability)"
  type        = bool
  default     = null # Will use environment-specific default if not specified
}

# Subnet Groups
variable "create_elasticache_subnet_group" {
  description = "Create ElastiCache subnet group"
  type        = bool
  default     = true
}

# VPC Endpoints
variable "enable_s3_endpoint" {
  description = "Enable VPC endpoint for S3"
  type        = bool
  default     = true
}

variable "enable_dynamodb_endpoint" {
  description = "Enable VPC endpoint for DynamoDB"
  type        = bool
  default     = true
}

variable "additional_vpc_endpoints" {
  description = "Additional VPC endpoints to create"
  type = map(object({
    service_name      = string
    vpc_endpoint_type = optional(string, "Gateway")
    route_table_ids   = optional(list(string), [])
    subnet_ids        = optional(list(string), [])
    security_group_ids = optional(list(string), [])
    auto_accept       = optional(bool, true)
  }))
  default = {}
}

# VPC Flow Logs
variable "enable_flow_log" {
  description = "Enable VPC Flow Logs"
  type        = bool
  default     = false
}

variable "flow_log_destination_type" {
  description = "Flow log destination type (cloud-watch-logs or s3)"
  type        = string
  default     = "cloud-watch-logs"
  validation {
    condition     = contains(["cloud-watch-logs", "s3"], var.flow_log_destination_type)
    error_message = "flow_log_destination_type must be either 'cloud-watch-logs' or 's3'."
  }
}

variable "flow_log_destination_arn" {
  description = "ARN for flow log destination (CloudWatch Log Group or S3 bucket)"
  type        = string
  default     = null
}

variable "flow_log_traffic_type" {
  description = "Type of traffic to capture (ALL, ACCEPT, REJECT)"
  type        = string
  default     = "ALL"
  validation {
    condition     = contains(["ALL", "ACCEPT", "REJECT"], var.flow_log_traffic_type)
    error_message = "flow_log_traffic_type must be ALL, ACCEPT, or REJECT."
  }
}

# Network ACLs
variable "create_network_acls" {
  description = "Create custom Network ACLs"
  type        = bool
  default     = false
}

variable "custom_network_acls" {
  description = "Custom Network ACL rules"
  type = map(object({
    subnet_type = string # "public", "private", "database"
    rules = list(object({
      rule_number = number
      protocol    = string
      rule_action = string
      port_range = optional(object({
        from = number
        to   = number
      }))
      cidr_block = string
      egress     = optional(bool, false)
    }))
  }))
  default = {}
}

# Tags
variable "tags" {
  description = "Additional tags for resources"
  type        = map(string)
  default     = {}
}
