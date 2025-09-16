# infrastructure/terraform/modules/eks/variables.tf
# EKS Module Variables

# =============================================================================
# GENERAL CONFIGURATION
# =============================================================================

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

variable "tags" {
  description = "Additional tags for all resources"
  type        = map(string)
  default     = {}
}

# =============================================================================
# EKS CLUSTER CONFIGURATION
# =============================================================================

variable "cluster_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
  default     = "1.28"
}

variable "cluster_log_types" {
  description = "List of control plane log types to enable"
  type        = list(string)
  default     = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
}

variable "log_retention_days" {
  description = "Number of days to retain cluster logs"
  type        = number
  default     = 7
}

variable "endpoint_private_access" {
  description = "Enable private API server endpoint"
  type        = bool
  default     = true
}

variable "endpoint_public_access" {
  description = "Enable public API server endpoint"
  type        = bool
  default     = true
}

variable "public_access_cidrs" {
  description = "List of CIDR blocks that can access the public endpoint"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# =============================================================================
# NETWORKING CONFIGURATION
# =============================================================================

variable "vpc_id" {
  description = "VPC ID where the cluster will be created"
  type        = string
}

variable "control_plane_subnet_ids" {
  description = "List of subnet IDs for the EKS control plane"
  type        = list(string)
}

variable "node_subnet_ids" {
  description = "List of subnet IDs for the EKS node groups"
  type        = list(string)
}

variable "fargate_subnet_ids" {
  description = "List of subnet IDs for Fargate profiles"
  type        = list(string)
  default     = []
}

variable "cluster_security_group_ids" {
  description = "List of security group IDs for the cluster"
  type        = list(string)
  default     = []
}

variable "create_additional_security_group" {
  description = "Create additional security group for the cluster"
  type        = bool
  default     = false
}

# =============================================================================
# NODE GROUPS CONFIGURATION
# =============================================================================

variable "node_groups" {
  description = "Map of EKS node group configurations"
  type = map(object({
    instance_types = list(string)
    capacity_type  = string
    scaling_config = object({
      desired_size = number
      max_size     = number
      min_size     = number
    })
    update_config = object({
      max_unavailable_percentage = number
    })
    disk_size    = optional(number)
    ami_type     = optional(string)
    labels       = optional(map(string))
    taints       = optional(list(object({
      key    = string
      value  = string
      effect = string
    })))
    launch_template = optional(object({
      id      = string
      version = string
    }))
    remote_access = optional(object({
      ec2_ssh_key               = string
      source_security_group_ids = list(string)
    }))
  }))
  default = {}
}

# =============================================================================
# FARGATE CONFIGURATION
# =============================================================================

variable "fargate_profiles" {
  description = "Map of Fargate profile configurations"
  type = map(object({
    selectors = list(object({
      namespace = string
      labels    = optional(map(string))
    }))
  }))
  default = {}
}

# =============================================================================
# ADD-ONS CONFIGURATION
# =============================================================================

variable "cluster_addons" {
  description = "Map of cluster add-on configurations"
  type = map(object({
    version                  = string
    resolve_conflicts        = optional(string)
    service_account_role_arn = optional(string)
    configuration_values     = optional(string)
  }))
  default = {
    coredns = {
      version = "v1.10.1-eksbuild.5"
    }
    kube-proxy = {
      version = "v1.28.2-eksbuild.2"
    }
    vpc-cni = {
      version = "v1.15.1-eksbuild.1"
    }
    aws-ebs-csi-driver = {
      version = "v1.24.0-eksbuild.1"
    }
  }
}

# =============================================================================
# ENCRYPTION CONFIGURATION
# =============================================================================

variable "kms_key_arn" {
  description = "ARN of KMS key for cluster encryption"
  type        = string
  default     = null
}

# =============================================================================
# IAM CONFIGURATION
# =============================================================================

variable "enable_irsa" {
  description = "Enable IAM Roles for Service Accounts"
  type        = bool
  default     = true
}

variable "oidc_root_ca_thumbprint" {
  description = "Thumbprint of Root CA for EKS OIDC, if you want to use a custom certificate bundle"
  type        = string
  default     = null
}
