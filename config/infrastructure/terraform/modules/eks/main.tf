# infrastructure/terraform/modules/eks/main.tf
# Production-ready EKS Cluster Module for School ERP SaaS

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = ">= 2.20"
    }
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

# Local values
locals {
  cluster_name = "${var.name_prefix}-eks-cluster"
  
  # Common tags
  common_tags = merge(var.tags, {
    "kubernetes.io/cluster/${local.cluster_name}" = "owned"
    "karpenter.sh/discovery"                      = local.cluster_name
  })

  # Node group configurations based on environment
  default_node_groups = {
    general = {
      instance_types = var.environment == "production" ? ["m6i.large", "m6i.xlarge"] : ["t3.medium", "t3.large"]
      capacity_type  = "ON_DEMAND"
      scaling_config = {
        desired_size = var.environment == "production" ? 3 : 2
        max_size     = var.environment == "production" ? 10 : 5
        min_size     = var.environment == "production" ? 2 : 1
      }
      update_config = {
        max_unavailable_percentage = 25
      }
      disk_size = 50
      ami_type  = "AL2_x86_64"
    }
  }

  # Merge user-provided node groups with defaults
  node_groups = merge(local.default_node_groups, var.node_groups)
}

# =============================================================================
# EKS CLUSTER
# =============================================================================

resource "aws_eks_cluster" "main" {
  name     = local.cluster_name
  version  = var.cluster_version
  role_arn = aws_iam_role.cluster.arn

  # VPC Configuration
  vpc_config {
    subnet_ids              = var.control_plane_subnet_ids
    endpoint_private_access = var.endpoint_private_access
    endpoint_public_access  = var.endpoint_public_access
    public_access_cidrs     = var.public_access_cidrs
    security_group_ids      = var.cluster_security_group_ids
  }

  # Cluster encryption
  encryption_config {
    provider {
      key_arn = var.kms_key_arn
    }
    resources = ["secrets"]
  }

  # Logging
  enabled_cluster_log_types = var.cluster_log_types

  # Ensure IAM roles are created first
  depends_on = [
    aws_iam_role_policy_attachment.cluster_policy,
    aws_iam_role_policy_attachment.cluster_vpc_policy,
    aws_cloudwatch_log_group.cluster,
  ]

  tags = local.common_tags
}

# =============================================================================
# CLOUDWATCH LOG GROUP
# =============================================================================

resource "aws_cloudwatch_log_group" "cluster" {
  name              = "/aws/eks/${local.cluster_name}/cluster"
  retention_in_days = var.log_retention_days
  
  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-logs"
  })
}

# =============================================================================
# EKS NODE GROUPS
# =============================================================================

resource "aws_eks_node_group" "main" {
  for_each = local.node_groups

  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${local.cluster_name}-${each.key}"
  node_role_arn   = aws_iam_role.node_group.arn
  subnet_ids      = var.node_subnet_ids

  # Instance configuration
  instance_types = each.value.instance_types
  capacity_type  = each.value.capacity_type
  disk_size      = lookup(each.value, "disk_size", 20)
  ami_type       = lookup(each.value, "ami_type", "AL2_x86_64")

  # Scaling configuration
  scaling_config {
    desired_size = each.value.scaling_config.desired_size
    max_size     = each.value.scaling_config.max_size
    min_size     = each.value.scaling_config.min_size
  }

  # Update configuration
  update_config {
    max_unavailable_percentage = each.value.update_config.max_unavailable_percentage
  }

  # Launch template (if specified)
  dynamic "launch_template" {
    for_each = lookup(each.value, "launch_template", null) != null ? [each.value.launch_template] : []
    content {
      id      = launch_template.value.id
      version = launch_template.value.version
    }
  }

  # Remote access (if SSH access needed)
  dynamic "remote_access" {
    for_each = lookup(each.value, "remote_access", null) != null ? [each.value.remote_access] : []
    content {
      ec2_ssh_key               = remote_access.value.ec2_ssh_key
      source_security_group_ids = remote_access.value.source_security_group_ids
    }
  }

  # Taints (for specialized workloads)
  dynamic "taint" {
    for_each = lookup(each.value, "taints", [])
    content {
      key    = taint.value.key
      value  = taint.value.value
      effect = taint.value.effect
    }
  }

  # Labels
  labels = merge(
    lookup(each.value, "labels", {}),
    {
      "node-group" = each.key
      "environment" = var.environment
    }
  )

  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-${each.key}-node-group"
  })

  # Ensure IAM roles are created first
  depends_on = [
    aws_iam_role_policy_attachment.node_group_worker_policy,
    aws_iam_role_policy_attachment.node_group_cni_policy,
    aws_iam_role_policy_attachment.node_group_registry_policy,
  ]

  # Ignore changes to desired_size as it may be managed by cluster autoscaler
  lifecycle {
    ignore_changes = [scaling_config[0].desired_size]
  }
}

# =============================================================================
# EKS ADD-ONS
# =============================================================================

resource "aws_eks_addon" "main" {
  for_each = var.cluster_addons

  cluster_name             = aws_eks_cluster.main.name
  addon_name               = each.key
  addon_version            = each.value.version
  resolve_conflicts        = lookup(each.value, "resolve_conflicts", "OVERWRITE")
  service_account_role_arn = lookup(each.value, "service_account_role_arn", null)

  # Configuration values (JSON)
  configuration_values = lookup(each.value, "configuration_values", null)

  depends_on = [aws_eks_node_group.main]

  tags = local.common_tags
}

# =============================================================================
# FARGATE PROFILES (Optional)
# =============================================================================

resource "aws_eks_fargate_profile" "main" {
  for_each = var.fargate_profiles

  cluster_name           = aws_eks_cluster.main.name
  fargate_profile_name   = each.key
  pod_execution_role_arn = aws_iam_role.fargate_profile[each.key].arn
  subnet_ids            = var.fargate_subnet_ids

  dynamic "selector" {
    for_each = each.value.selectors
    content {
      namespace = selector.value.namespace
      labels    = lookup(selector.value, "labels", {})
    }
  }

  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-${each.key}-fargate"
  })

  depends_on = [
    aws_iam_role_policy_attachment.fargate_profile_policy,
  ]
}

# =============================================================================
# IAM ROLES AND POLICIES
# =============================================================================

# EKS Cluster Service Role
resource "aws_iam_role" "cluster" {
  name = "${local.cluster_name}-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "eks.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.cluster.name
}

resource "aws_iam_role_policy_attachment" "cluster_vpc_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController"
  role       = aws_iam_role.cluster.name
}

# EKS Node Group Role
resource "aws_iam_role" "node_group" {
  name = "${local.cluster_name}-node-group-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "node_group_worker_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.node_group.name
}

resource "aws_iam_role_policy_attachment" "node_group_cni_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.node_group.name
}

resource "aws_iam_role_policy_attachment" "node_group_registry_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.node_group.name
}

# Additional policies for node groups
resource "aws_iam_policy" "node_group_additional" {
  name        = "${local.cluster_name}-node-group-additional"
  description = "Additional permissions for EKS node groups"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath",
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
          "kms:Decrypt"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.name_prefix}-*",
          "arn:aws:s3:::${var.name_prefix}-*/*"
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "node_group_additional" {
  policy_arn = aws_iam_policy.node_group_additional.arn
  role       = aws_iam_role.node_group.name
}

# Fargate Profile Roles (if Fargate is used)
resource "aws_iam_role" "fargate_profile" {
  for_each = var.fargate_profiles

  name = "${local.cluster_name}-fargate-${each.key}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "eks-fargate-pods.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "fargate_profile_policy" {
  for_each = var.fargate_profiles

  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSFargatePodExecutionRolePolicy"
  role       = aws_iam_role.fargate_profile[each.key].name
}

# =============================================================================
# SECURITY GROUPS
# =============================================================================

resource "aws_security_group" "cluster_additional" {
  count = var.create_additional_security_group ? 1 : 0

  name_prefix = "${local.cluster_name}-additional-"
  vpc_id      = var.vpc_id
  description = "Additional security group for EKS cluster"

  # Allow all traffic between cluster and nodes
  ingress {
    from_port = 0
    to_port   = 65535
    protocol  = "tcp"
    self      = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-additional-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# =============================================================================
# OIDC IDENTITY PROVIDER
# =============================================================================

data "tls_certificate" "cluster" {
  url = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "cluster" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.cluster.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer

  tags = local.common_tags
}

# =============================================================================
# KUBERNETES PROVIDER CONFIGURATION
# =============================================================================

data "aws_eks_cluster_auth" "main" {
  name = aws_eks_cluster.main.name
}

provider "kubernetes" {
  host                   = aws_eks_cluster.main.endpoint
  cluster_ca_certificate = base64decode(aws_eks_cluster.main.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.main.token
}
