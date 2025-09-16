# infrastructure/terraform/modules/ecr/versions.tf
# Provider version constraints

terraform {
  required_version = ">= 1.6.0"
  
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = ">= 5.0"
      configuration_aliases = []
    }
  }
}
