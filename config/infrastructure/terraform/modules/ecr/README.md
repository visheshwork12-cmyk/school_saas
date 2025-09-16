# ECR (Elastic Container Registry) Module

This Terraform module creates and manages AWS ECR repositories for the School ERP SaaS application with comprehensive features including encryption, scanning, lifecycle policies, and cross-region replication.

## Features

- 🐳 **Multiple Repository Support** - Create multiple ECR repositories for different services
- 🔒 **Encryption** - KMS encryption for repositories at rest
- 🔍 **Image Scanning** - Basic and enhanced vulnerability scanning
- ♻️ **Lifecycle Management** - Automated cleanup of old images
- 🌍 **Cross-Region Replication** - Disaster recovery and global distribution
- 🏷️ **Flexible Tagging** - Comprehensive resource tagging
- 📊 **Monitoring** - CloudWatch integration for logging and metrics
- 🔐 **Access Control** - Fine-grained IAM policies and repository policies

## Usage

### Basic Usage

module "ecr" {
source = "./modules/ecr"

name_prefix = "school-erp-saas"
environment = "production"

tags = {
Project = "school-erp-saas"
Owner = "platform-team"
}
}

text

### Advanced Usage with Custom Repositories

module "ecr" {
source = "./modules/ecr"

name_prefix = "school-erp-saas"
environment = "production"

Additional repositories
repositories = {
"school-erp-saas-frontend" = {
description = "Frontend React application"
image_tag_mutability = "MUTABLE"
scan_on_push = true
lifecycle_policy = "default"
cross_region_replication = true
}
"school-erp-saas-nginx" = {
description = "Nginx reverse proxy"
image_tag_mutability = "IMMUTABLE"
scan_on_push = true
lifecycle_policy = "long_term"
cross_region_replication = false
}
}

Access control
repository_read_access_arns = [
"arn:aws:iam::123456789012:role/EKS-NodeGroup-Role"
]

repository_read_write_access_arns = [
"arn:aws:iam::123456789012:role/CI-CD-Role",
"arn:aws:iam::123456789012:user/developer"
]

Enable enhanced features
enable_encryption = true
enable_cross_region_replication = true
enhanced_scanning = true
replication_region = "us-west-2"

tags = {
Project = "school-erp-saas"
Owner = "platform-team"
Environment = "production"
CostCenter = "engineering"
}
}

text

## Default Repositories Created

The module automatically creates these repositories:

1. **`{name_prefix}-api`** - Main API application container
2. **`{name_prefix}-worker`** - Background worker container  
3. **`{name_prefix}-migration`** - Database migration container

## Lifecycle Policies

### Default Policy
- Keeps last 10 production images (`v*`, `prod*`, `release*`)
- Keeps last 5 staging images (`staging*`, `stage*`)
- Keeps last 3 development images (`dev*`, `feature*`, `hotfix*`)
- Deletes untagged images older than 1 day

### Migration Policy
- Keeps last 5 migration images
- Deletes images older than 30 days

### Long Term Policy
- Keeps last 50 images of any tag

## Security Features

- **KMS Encryption** - All repositories encrypted at rest
- **Image Scanning** - Vulnerability scanning on push
- **Access Control** - Fine-grained IAM and repository policies
- **Cross-Account Access** - Controlled access across AWS accounts

## Monitoring & Logging

- CloudWatch log group for ECR events
- Image scan findings retention
- Configurable log retention periods

## Cost Optimization

- Automatic lifecycle policies to clean up old images
- Configurable image retention policies
- Cross-region replication only where needed

## Requirements

| Name | Version |
|------|---------|
| terraform | >= 1.6.0 |
| aws | >= 5.0 |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| name_prefix | Name prefix for ECR repositories | `string` | n/a | yes |
| environment | Environment name | `string` | n/a | yes |
| repositories | Additional repositories to create | `map(object)` | `{}` | no |
| enable_encryption | Enable KMS encryption | `bool` | `true` | no |
| enable_cross_region_replication | Enable cross-region replication | `bool` | `false` | no |
| enhanced_scanning | Enable enhanced scanning | `bool` | `false` | no |
| repository_read_access_arns | ARNs for pull access | `list(string)` | `[]` | no |
| repository_read_write_access_arns | ARNs for push/pull access | `list(string)` | `null` | no |
| tags | Tags to apply to resources | `map(string)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| repository_urls | URLs of all ECR repositories |
| repository_arns | ARNs of all ECR repositories |
| api_repository_url | URL of the main API repository |
| registry_url | ECR registry URL |
| docker_login_command | Command to login to ECR |

## Examples

### CI/CD Integration


Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

Build and tag image
docker build -t school-erp-saas-api:latest .
docker tag school-erp-saas-api:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/school-erp-saas-api:latest

Push image
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/school-erp-saas-api:latest

text

### EKS Integration

kubernetes-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
name: school-erp-api
spec:
template:
spec:
containers:
- name: api
image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/school-erp-saas-api:v1.2.0

text

## Best Practices

1. **Use Immutable Tags** for production images
2. **Enable Scanning** on all repositories
3. **Implement Lifecycle Policies** to manage costs
4. **Use Semantic Versioning** for image tags
5. **Enable Cross-Region Replication** for critical repositories
6. **Monitor Scan Results** and address vulnerabilities promptly

## License

MIT License - see LICENSE file for details.
🚀 Main Terraform File mein Integration
Main terraform file mein ECR module add karna hoga:

text
# In infrastructure/terraform/main.tf

# ECR Module
module "ecr" {
  source = "./modules/ecr"

  name_prefix = local.name_prefix
  environment = var.environment

  # Additional repositories specific to school ERP
  repositories = {
    "${local.name_prefix}-notification-service" = {
      description              = "Notification microservice"
      image_tag_mutability    = "MUTABLE"
      scan_on_push            = true
      lifecycle_policy        = "default"
      cross_region_replication = var.environment == "production" ? true : false
    }
    "${local.name_prefix}-file-processor" = {
      description              = "File processing service"
      image_tag_mutability    = "MUTABLE"
      scan_on_push            = true
      lifecycle_policy        = "default"
      cross_region_replication = false
    }
  }

  # Access control
  repository_read_access_arns = [
    module.eks.node_group_role_arn,
    module.ecs.execution_role_arn
  ]
  
  repository_read_write_access_arns = [
    module.iam.ci_cd_role_arn
  ]

  # Enable features based on environment
  enable_encryption               = true
  enable_cross_region_replication = var.environment == "production"
  enhanced_scanning              = var.environment == "production"
  replication_region             = "us-west-2"
  
  log_retention_days = var.environment == "production" ? 30 : 7

  tags = local.common_tags
}