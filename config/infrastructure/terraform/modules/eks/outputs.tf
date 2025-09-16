# infrastructure/terraform/modules/eks/outputs.tf
# EKS Module Outputs

# =============================================================================
# CLUSTER OUTPUTS
# =============================================================================

output "cluster_id" {
  description = "The name/id of the EKS cluster"
  value       = aws_eks_cluster.main.id
}

output "cluster_name" {
  description = "The name of the EKS cluster"
  value       = aws_eks_cluster.main.name
}

output "cluster_arn" {
  description = "The Amazon Resource Name (ARN) of the cluster"
  value       = aws_eks_cluster.main.arn
}

output "cluster_endpoint" {
  description = "Endpoint for EKS control plane"
  value       = aws_eks_cluster.main.endpoint
  sensitive   = true
}

output "cluster_version" {
  description = "The Kubernetes version for the cluster"
  value       = aws_eks_cluster.main.version
}

output "cluster_platform_version" {
  description = "Platform version for the cluster"
  value       = aws_eks_cluster.main.platform_version
}

output "cluster_status" {
  description = "Status of the EKS cluster. One of `CREATING`, `ACTIVE`, `DELETING`, `FAILED`"
  value       = aws_eks_cluster.main.status
}

# =============================================================================
# CLUSTER SECURITY
# =============================================================================

output "cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data required to communicate with the cluster"
  value       = aws_eks_cluster.main.certificate_authority[0].data
}

output "cluster_security_group_id" {
  description = "Security group ID attached to the EKS cluster"
  value       = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id
}

output "additional_security_group_id" {
  description = "ID of the additional security group created for the cluster"
  value       = var.create_additional_security_group ? aws_security_group.cluster_additional[0].id : null
}

# =============================================================================
# IAM OUTPUTS
# =============================================================================

output "cluster_iam_role_name" {
  description = "IAM role name associated with EKS cluster"
  value       = aws_iam_role.cluster.name
}

output "cluster_iam_role_arn" {
  description = "IAM role ARN associated with EKS cluster"
  value       = aws_iam_role.cluster.arn
}

output "node_group_iam_role_name" {
  description = "IAM role name associated with EKS node groups"
  value       = aws_iam_role.node_group.name
}

output "node_group_iam_role_arn" {
  description = "IAM role ARN associated with EKS node groups"
  value       = aws_iam_role.node_group.arn
}

output "fargate_profile_iam_role_arns" {
  description = "IAM role ARNs associated with Fargate profiles"
  value       = { for k, v in aws_iam_role.fargate_profile : k => v.arn }
}

# =============================================================================
# OIDC PROVIDER OUTPUTS
# =============================================================================

output "oidc_provider_arn" {
  description = "The ARN of the OIDC Identity Provider"
  value       = aws_iam_openid_connect_provider.cluster.arn
}

output "cluster_oidc_issuer_url" {
  description = "The URL on the EKS cluster for the OpenID Connect identity provider"
  value       = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

# =============================================================================
# NODE GROUP OUTPUTS
# =============================================================================

output "node_groups" {
  description = "Map of node group configurations and their attributes"
  value = {
    for k, v in aws_eks_node_group.main : k => {
      arn           = v.arn
      status        = v.status
      capacity_type = v.capacity_type
      instance_types = v.instance_types
      ami_type      = v.ami_type
      disk_size     = v.disk_size
      remote_access = try(v.remote_access[0], null)
      scaling_config = v.scaling_config[0]
      update_config = v.update_config[0]
      labels        = v.labels
      taints        = v.taint
      resources     = v.resources
    }
  }
}

# =============================================================================
# FARGATE PROFILE OUTPUTS
# =============================================================================

output "fargate_profiles" {
  description = "Map of Fargate profile configurations and their attributes"
  value = {
    for k, v in aws_eks_fargate_profile.main : k => {
      arn                    = v.arn
      status                = v.status
      pod_execution_role_arn = v.pod_execution_role_arn
      selectors             = v.selector
      subnet_ids            = v.subnet_ids
    }
  }
}

# =============================================================================
# ADD-ON OUTPUTS
# =============================================================================

output "cluster_addons" {
  description = "Map of cluster add-on configurations and their attributes"
  value = {
    for k, v in aws_eks_addon.main : k => {
      arn               = v.arn
      addon_version     = v.addon_version
      status            = v.status
      created_at        = v.created_at
      modified_at       = v.modified_at
    }
  }
}

# =============================================================================
# CLOUDWATCH OUTPUTS
# =============================================================================

output "cloudwatch_log_group_name" {
  description = "Name of the CloudWatch log group for cluster logs"
  value       = aws_cloudwatch_log_group.cluster.name
}

output "cloudwatch_log_group_arn" {
  description = "ARN of the CloudWatch log group for cluster logs"
  value       = aws_cloudwatch_log_group.cluster.arn
}

# =============================================================================
# KUBECONFIG
# =============================================================================

output "kubeconfig" {
  description = "kubectl config as generated by the module"
  value = {
    apiVersion      = "v1"
    kind            = "Config"
    current-context = "terraform"
    contexts = [{
      name = "terraform"
      context = {
        cluster = "terraform"
        user    = "terraform"
      }
    }]
    clusters = [{
      name = "terraform"
      cluster = {
        certificate-authority-data = aws_eks_cluster.main.certificate_authority[0].data
        server                     = aws_eks_cluster.main.endpoint
      }
    }]
    users = [{
      name = "terraform"
      user = {
        exec = {
          apiVersion = "client.authentication.k8s.io/v1beta1"
          command    = "aws"
          args = [
            "eks",
            "get-token",
            "--cluster-name",
            aws_eks_cluster.main.name,
            "--region",
            data.aws_region.current.name
          ]
        }
      }
    }]
  }
  sensitive = true
}
