# RDS Terraform Module

This module creates a production-ready Amazon RDS instance with comprehensive security, monitoring, and backup features.

## Features

- ✅ **Multi-Environment Support** - Development, Staging, Production configurations
- ✅ **Security** - Encryption at rest, VPC security groups, parameter groups
- ✅ **High Availability** - Multi-AZ deployment support
- ✅ **Monitoring** - Enhanced monitoring, Performance Insights, CloudWatch logs
- ✅ **Backup & Recovery** - Automated backups, point-in-time recovery
- ✅ **Read Replicas** - Optional read replicas for scaling read workloads
- ✅ **Parameter Store Integration** - Store connection details securely
- ✅ **KMS Encryption** - Custom KMS key for enhanced security

## Usage

### Basic Usage

module "rds" {
source = "./modules/rds"

name_prefix = "school-erp"
environment = "production"

Network Configuration
subnet_ids = module.vpc.database_subnet_ids
vpc_security_group_ids = [module.security_groups.rds_security_group_id]

Database Configuration
engine = "postgres"
engine_version = "15.4"
database_name = "schoolerp"
username = "admin"

tags = {
Project = "school-erp-saas"
Owner = "DevOps Team"
}
}

text

### Production Configuration

module "rds" {
source = "./modules/rds"

name_prefix = "school-erp-prod"
environment = "production"

Network Configuration
subnet_ids = module.vpc.database_subnet_ids
vpc_security_group_ids = [module.security_groups.rds_security_group_id]

Database Configuration
engine = "postgres"
engine_version = "15.4"
instance_class = "db.r6g.xlarge"
database_name = "schoolerp"
username = "admin"

Storage Configuration
allocated_storage = 500
max_allocated_storage = 1000
storage_type = "gp3"
storage_encrypted = true

High Availability
multi_az = true

Backup Configuration
backup_retention_period = 30
backup_window = "03:00-04:00"
maintenance_window = "sun:04:00-sun:05:00"

Monitoring
performance_insights_enabled = true
monitoring_interval = 60

Security
deletion_protection = true

Read Replicas
create_read_replica = true
read_replica_count = 2
read_replica_instance_class = "db.r6g.large"

tags = {
Project = "school-erp-saas"
Environment = "production"
Owner = "Platform Team"
CostCenter = "Engineering"
}
}

text

## Environment-Based Defaults

The module automatically configures optimal settings based on environment:

### Development
- Instance: `db.t3.micro`
- Storage: 20GB (max 100GB)
- Multi-AZ: Disabled
- Backups: 7 days
- Performance Insights: Disabled
- Deletion Protection: Disabled

### Staging
- Instance: `db.t3.small`
- Storage: 100GB (max 200GB)
- Multi-AZ: Disabled
- Backups: 14 days
- Performance Insights: Enabled
- Deletion Protection: Enabled

### Production
- Instance: `db.r6g.large`
- Storage: 500GB (max 1000GB)
- Multi-AZ: Enabled
- Backups: 30 days
- Performance Insights: Enabled
- Deletion Protection: Enabled

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|----------|
| name_prefix | Name prefix for all resources | `string` | n/a | yes |
| environment | Environment name | `string` | n/a | yes |
| subnet_ids | Database subnet IDs | `list(string)` | n/a | yes |
| vpc_security_group_ids | Security group IDs | `list(string)` | n/a | yes |
| engine | Database engine | `string` | `postgres` | no |
| engine_version | Engine version | `string` | `15.4` | no |
| instance_class | Instance class | `string` | `null` | no |
| database_name | Database name | `string` | `schoolerp` | no |
| username | Master username | `string` | `admin` | no |
| password | Master password | `string` | `null` | no |

## Outputs

| Name | Description |
|------|-------------|
| instance_id | RDS instance ID |
| endpoint | Database endpoint |
| port | Database port |
| connection_string | Full connection string |
| kms_key_arn | KMS key ARN |
| ssm_parameters | SSM parameter names |

## Security Features

- **Encryption at Rest** - All data encrypted using KMS
- **Encryption in Transit** - SSL/TLS connections enforced
- **Network Security** - VPC-only access with security groups
- **Parameter Groups** - Secure database configuration
- **Password Management** - Random password generation and SSM storage

## Monitoring & Observability

- **Enhanced Monitoring** - Detailed metrics every 60 seconds
- **Performance Insights** - Query performance analysis
- **CloudWatch Logs** - Database logs exported to CloudWatch
- **Backup Monitoring** - Automated backup verification

## Best Practices Implemented

1. **Security First** - Encryption, least privilege access
2. **High Availability** - Multi-AZ for production workloads
3. **Disaster Recovery** - Automated backups and point-in-time recovery
4. **Performance** - Performance Insights and enhanced monitoring
5. **Cost Optimization** - Environment-appropriate sizing
6. **Operational Excellence** - Comprehensive logging and monitoring

## Examples

See the `examples/` directory for complete usage examples:
- `examples/basic/` - Minimal configuration
- `examples/production/` - Production-ready setup
- `examples/multi-az/` - High availability configuration
- `examples/read-replicas/` - Read replica setup

## Requirements

- Terraform >= 1.6.0
- AWS Provider >= 5.0
- Random Provider >= 3.1

## License

MIT License - see LICENSE file for details.