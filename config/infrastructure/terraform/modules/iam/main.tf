# modules/iam/main.tf - Complete IAM Setup
locals {
  common_tags = {
    Project     = var.name_prefix
    Environment = var.environment
    ManagedBy   = "Terraform"
    Service     = "SchoolERP"
  }
}

# EKS Cluster Service Role
resource "aws_iam_role" "eks_cluster_role" {
  name = "${var.name_prefix}-eks-cluster-role"

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

# EKS Node Group Role
resource "aws_iam_role" "eks_node_role" {
  name = "${var.name_prefix}-eks-node-role"

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

# Application Service Role
resource "aws_iam_role" "app_service_role" {
  name = "${var.name_prefix}-app-service-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      },
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Condition = {
          StringEquals = {
            "sts:ExternalId" = "${var.name_prefix}-app"
          }
        }
      }
    ]
  })

  tags = local.common_tags
}



# EKS Cluster Policies
resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.eks_cluster_role.name
}

# EKS Node Group Policies
resource "aws_iam_role_policy_attachment" "eks_worker_node_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.eks_node_role.name
}

resource "aws_iam_role_policy_attachment" "eks_cni_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.eks_node_role.name
}

resource "aws_iam_role_policy_attachment" "eks_registry_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.eks_node_role.name
}



# Custom S3 Policy for Application
resource "aws_iam_policy" "app_s3_policy" {
  name        = "${var.name_prefix}-app-s3-policy"
  description = "S3 access policy for School ERP application"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          var.app_storage_bucket_arn,
          "${var.app_storage_bucket_arn}/*",
          var.backup_storage_bucket_arn,
          "${var.backup_storage_bucket_arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListAllMyBuckets",
          "s3:GetBucketLocation"
        ]
        Resource = "*"
      }
    ]
  })

  tags = local.common_tags
}

# DocumentDB/MongoDB Access Policy
resource "aws_iam_policy" "app_documentdb_policy" {
  name        = "${var.name_prefix}-app-documentdb-policy"
  description = "DocumentDB access policy for School ERP"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "rds:DescribeDBInstances",
          "rds:DescribeDBClusters",
          "rds:ListTagsForResource"
        ]
        Resource = "*"
      }
    ]
  })

  tags = local.common_tags
}




# CloudWatch Policy
resource "aws_iam_policy" "app_cloudwatch_policy" {
  name        = "${var.name_prefix}-app-cloudwatch-policy"
  description = "CloudWatch access for application logging and metrics"

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
        Resource = "arn:aws:logs:*:${data.aws_caller_identity.current.account_id}:*"
      },
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData",
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:ListMetrics"
        ]
        Resource = "*"
      }
    ]
  })

  tags = local.common_tags
}

locals {
  iam_policies = {
    rds_access = file("${path.root}/../../../security/policies/iam/rds-access-policy.json")
    eks_cluster = file("${path.root}/../../../security/policies/iam/eks-cluster-policy.json")
    backup = file("${path.root}/../../../security/policies/iam/backup-policy.json")
    secrets_manager = file("${path.root}/../../../security/policies/iam/secrets-manager-policy.json")
    ecr_access = file("${path.root}/../../../security/policies/iam/ecr-access-policy.json")
  }
}

# Create IAM policies
resource "aws_iam_policy" "school_erp_policies" {
  for_each = local.iam_policies
  
  name        = "${var.nameprefix}-${each.key}-policy"
  description = "IAM policy for ${each.key} access in School ERP SaaS"
  policy      = each.value
  
  tags = merge(local.common_tags, {
    Name = "${var.nameprefix}-${each.key}-policy"
    PolicyType = each.key
  })
}
