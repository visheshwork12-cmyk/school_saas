# infrastructure/terraform/provider.tf
# AWS Provider Configuration for School ERP SaaS
# Multi-region support with comprehensive provider settings

# Configure AWS Provider with enhanced settings
provider "aws" {
  region = var.aws_region
  
  # Profile and credentials (use environment variables in production)
  profile = var.aws_profile
  
  # Additional configuration
  max_retries                     = 3
  skip_credentials_validation     = false
  skip_get_ec2_platforms         = false
  skip_metadata_api_check        = false
  skip_region_validation         = false
  skip_requesting_account_id     = false
  
  # Default tags applied to all resources
  default_tags {
    tags = {
      Project      = "school-erp-saas"
      Environment  = var.environment
      ManagedBy    = "terraform"
      Owner        = var.project_owner
      CostCenter   = var.cost_center
      CreatedDate  = formatdate("YYYY-MM-DD", timestamp())
      
      # Compliance and security tags
      DataClass    = var.data_classification
      Compliance   = "SOC2,GDPR,FERPA"
      
      # Operational tags
      BackupPolicy = var.backup_enabled ? "enabled" : "disabled"
      Monitoring   = "enabled"
      
      # Terraform workspace
      Workspace    = terraform.workspace
    }
  }

  # Assume role configuration (for cross-account deployments)
  dynamic "assume_role" {
    for_each = var.assume_role_arn != "" ? [1] : []
    content {
      role_arn     = var.assume_role_arn
      session_name = "terraform-school-erp-${var.environment}"
      external_id  = var.external_id
    }
  }

  # Ignore specific tags to prevent constant changes
  ignore_tags {
    keys = ["CreatedDate"]
  }
}

# Secondary provider for different region (for cross-region resources)
provider "aws" {
  alias  = "secondary"
  region = var.secondary_aws_region
  
  # Use same configuration as primary provider
  profile                        = var.aws_profile
  max_retries                    = 3
  skip_credentials_validation    = false
  skip_get_ec2_platforms        = false
  skip_metadata_api_check       = false
  skip_region_validation        = false
  skip_requesting_account_id    = false

  default_tags {
    tags = {
      Project      = "school-erp-saas"
      Environment  = var.environment
      ManagedBy    = "terraform"
      Owner        = var.project_owner
      CostCenter   = var.cost_center
      CreatedDate  = formatdate("YYYY-MM-DD", timestamp())
      Region       = "secondary"
      DataClass    = var.data_classification
      Compliance   = "SOC2,GDPR,FERPA"
      BackupPolicy = var.backup_enabled ? "enabled" : "disabled"
      Monitoring   = "enabled"
      Workspace    = terraform.workspace
    }
  }

  dynamic "assume_role" {
    for_each = var.assume_role_arn != "" ? [1] : []
    content {
      role_arn     = var.assume_role_arn
      session_name = "terraform-school-erp-${var.environment}-secondary"
      external_id  = var.external_id
    }
  }

  ignore_tags {
    keys = ["CreatedDate"]
  }
}

# US East 1 provider (for CloudFront, ACM certificates)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  
  profile                        = var.aws_profile
  max_retries                    = 3
  skip_credentials_validation    = false
  skip_get_ec2_platforms        = false
  skip_metadata_api_check       = false
  skip_region_validation        = false
  skip_requesting_account_id    = false

  default_tags {
    tags = {
      Project      = "school-erp-saas"
      Environment  = var.environment
      ManagedBy    = "terraform"
      Owner        = var.project_owner
      CostCenter   = var.cost_center
      CreatedDate  = formatdate("YYYY-MM-DD", timestamp())
      Purpose      = "global-resources"
      DataClass    = var.data_classification
      Compliance   = "SOC2,GDPR,FERPA"
      BackupPolicy = var.backup_enabled ? "enabled" : "disabled"
      Monitoring   = "enabled"
      Workspace    = terraform.workspace
    }
  }

  dynamic "assume_role" {
    for_each = var.assume_role_arn != "" ? [1] : []
    content {
      role_arn     = var.assume_role_arn
      session_name = "terraform-school-erp-${var.environment}-global"
      external_id  = var.external_id
    }
  }

  ignore_tags {
    keys = ["CreatedDate"]
  }
}

# Kubernetes Provider (for EKS cluster management)
provider "kubernetes" {
  host                   = try(module.eks.cluster_endpoint, "")
  cluster_ca_certificate = try(base64decode(module.eks.cluster_certificate_authority_data), "")
  
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args = [
      "eks",
      "get-token",
      "--cluster-name",
      try(module.eks.cluster_name, ""),
      "--region",
      var.aws_region,
    ]
  }

  # Only configure if EKS is enabled
  count = var.enable_eks ? 1 : 0
}

# Helm Provider (for Kubernetes applications)
provider "helm" {
  kubernetes {
    host                   = try(module.eks.cluster_endpoint, "")
    cluster_ca_certificate = try(base64decode(module.eks.cluster_certificate_authority_data), "")
    
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args = [
        "eks",
        "get-token",
        "--cluster-name",
        try(module.eks.cluster_name, ""),
        "--region",
        var.aws_region,
      ]
    }
  }

  # Only configure if EKS is enabled
  count = var.enable_eks ? 1 : 0
}

# Local provider for local resources
provider "local" {}

# Random provider for generating random values
provider "random" {}

# TLS provider for certificate generation
provider "tls" {}

# Archive provider for packaging
provider "archive" {}

# Template provider for file templates
provider "template" {}

# Data sources for provider information
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

# Local values for provider configuration
locals {
  # Account and region information
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name
  
  # Available AZs
  azs = slice(data.aws_availability_zones.available.names, 0, min(length(data.aws_availability_zones.available.names), 3))
  
  # Common resource naming
  name_prefix = "${var.project_name}-${var.environment}"
  
  # Common tags for all resources
  common_tags = {
    Project             = var.project_name
    Environment         = var.environment
    ManagedBy          = "terraform"
    Owner              = var.project_owner
    CostCenter         = var.cost_center
    DataClassification = var.data_classification
    
    # Compliance tags
    SOC2Compliant  = "true"
    GDPRCompliant  = "true"
    FERPACompliant = "true"
    
    # Operational tags
    BackupEnabled    = var.backup_enabled
    MonitoringLevel  = "standard"
    MaintenanceWindow = var.maintenance_window
    
    # Infrastructure tags
    TerraformWorkspace = terraform.workspace
    Region            = local.region
    AvailabilityZones = join(",", local.azs)
  }
}

# Outputs for provider information
output "provider_info" {
  description = "Information about AWS provider configuration"
  value = {
    account_id        = local.account_id
    region           = local.region
    secondary_region = var.secondary_aws_region
    availability_zones = local.azs
    terraform_workspace = terraform.workspace
  }
}

output "common_tags" {
  description = "Common tags applied to all resources"
  value = local.common_tags
}
