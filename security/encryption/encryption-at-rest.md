# Encryption at Rest Policy for School ERP SaaS

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Scope and Applicability](#scope-and-applicability)
3. [Encryption Standards](#encryption-standards)
4. [Key Management](#key-management)
5. [Data Classification](#data-classification)
6. [Implementation Details](#implementation-details)
7. [Compliance Requirements](#compliance-requirements)
8. [Monitoring and Auditing](#monitoring-and-auditing)
9. [Incident Response](#incident-response)
10. [Policy Maintenance](#policy-maintenance)

## 1. Executive Summary

This document establishes the comprehensive encryption-at-rest policy for the School ERP SaaS platform, ensuring all sensitive data stored within the system is protected using industry-standard encryption methods and meets regulatory compliance requirements including GDPR, FERPA, and other applicable data protection laws.

## 2. Scope and Applicability

### 2.1 Covered Data Types
- **Student Personal Information**: Names, addresses, contact details, academic records
- **Special Category Data**: Medical information, disciplinary records, special needs data
- **Staff Information**: Employee records, payroll data, performance evaluations
- **Financial Data**: Fee records, transaction histories, budget information
- **System Data**: Authentication credentials, API keys, configuration files
- **Backup Data**: All backup copies and archived information

### 2.2 Covered Systems and Services
- Amazon RDS (PostgreSQL databases)
- Amazon S3 (File storage and backups)
- Amazon ElastiCache (Redis caching)
- Amazon EBS (Elastic Block Store volumes)
- Amazon EFS (Elastic File System)
- AWS Secrets Manager
- CloudWatch Logs
- Application-level file storage

## 3. Encryption Standards

### 3.1 Approved Encryption Algorithms

| Data Store | Encryption Algorithm | Key Size | Mode |
|------------|---------------------|----------|------|
| RDS Databases | AES-256 | 256-bit | CBC |
| S3 Storage | AES-256 | 256-bit | GCM |
| EBS Volumes | AES-256 | 256-bit | XTS |
| ElastiCache | AES-256 | 256-bit | GCM |
| Secrets Manager | AES-256 | 256-bit | GCM |
| Application Files | AES-256-GCM | 256-bit | GCM |

### 3.2 Prohibited Algorithms
- DES (Data Encryption Standard)
- 3DES (Triple DES)
- RC4
- MD5 hashing for security purposes
- Any encryption with key sizes below 128-bit

### 3.3 Encryption Implementation
Example: RDS Encryption Configuration
resource "aws_db_instance" "school_erp_db" {
allocated_storage = 100
storage_encrypted = true
kms_key_id = aws_kms_key.database.arn
performance_insights_enabled = true
performance_insights_kms_key_id = aws_kms_key.database.arn
}

Example: S3 Bucket Encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "school_erp_bucket" {
bucket = aws_s3_bucket.school_erp_storage.id

rule {
apply_server_side_encryption_by_default {
kms_master_key_id = aws_kms_key.s3_storage.arn
sse_algorithm = "aws:kms"
}
bucket_key_enabled = true
}
}

text

## 4. Key Management

### 4.1 AWS KMS Key Hierarchy

graph TD
A[AWS KMS Root Keys] --> B[Primary Application Key]
A --> C[Database Encryption Key]
A --> D[Storage Encryption Key]
A --> E[Secrets Manager Key]
A --> F[Backup Encryption Key]

text
B --> G[Multi-tenant Data Encryption]
C --> H[RDS Instance Encryption]
D --> I[S3 Bucket Encryption]
E --> J[Credentials Encryption]
F --> K[Backup Data Encryption]
text

### 4.2 Key Management Practices

#### 4.2.1 Key Generation
- All encryption keys are generated using AWS KMS
- Keys utilize FIPS 140-2 Level 2 validated hardware security modules (HSMs)
- Cryptographically secure random number generation

#### 4.2.2 Key Rotation
resource "aws_kms_key" "school_erp_primary" {
description = "Primary KMS key for School ERP encryption"
enable_key_rotation = true # Automatic annual rotation

tags = {
Name = "school-erp-primary-key"
Environment = var.environment
AutoRotation = "enabled"
RotationPeriod = "365-days"
}
}

text

- **Automatic Rotation**: Enabled for all KMS keys (annual)
- **Manual Rotation**: Available for emergency situations
- **Application Keys**: Rotated every 90 days
- **Database Keys**: Rotated annually via AWS KMS
- **File Encryption Keys**: Rotated every 180 days

#### 4.2.3 Key Access Controls
{
"Version": "2012-10-17",
"Statement": [
{
"Sid": "DatabaseServiceAccess",
"Effect": "Allow",
"Principal": {
"AWS": "arn:aws:iam::ACCOUNT:role/school-erp-database-role"
},
"Action": [
"kms:Encrypt",
"kms:Decrypt",
"kms:ReEncrypt*",
"kms:GenerateDataKey*",
"kms:DescribeKey"
],
"Resource": "*",
"Condition": {
"StringEquals": {
"kms:EncryptionContext:service": "school-erp-database"
}
}
}
]
}

text

### 4.3 Key Storage and Protection
- **AWS KMS**: Primary key management service
- **Hardware Security Modules**: FIPS 140-2 Level 2 compliance
- **Access Logging**: All key usage logged and monitored
- **Geographic Replication**: Keys replicated across multiple AWS regions

## 5. Data Classification

### 5.1 Data Classification Levels

| Classification | Examples | Encryption Requirement | Key Management |
|----------------|----------|----------------------|----------------|
| **Public** | Marketing materials, public announcements | Optional | Standard rotation |
| **Internal** | System logs, configuration files | Required (AES-256) | Standard rotation |
| **Confidential** | Student records, staff information | Required (AES-256) | Enhanced controls |
| **Restricted** | Medical records, disciplinary data | Required (AES-256) | Strict controls |

### 5.2 Data Handling Requirements

#### 5.2.1 Confidential Data
// Application-level encryption for sensitive fields
const encryptSensitiveData = async (data, tenantId) => {
const encryptionKey = await getDataEncryptionKey(tenantId);

const encryptedData = {
...data,
// Encrypt PII fields
firstName: await encrypt(data.firstName, encryptionKey),
lastName: await encrypt(data.lastName, encryptionKey),
dateOfBirth: await encrypt(data.dateOfBirth, encryptionKey),
// Keep searchable hash for non-sensitive queries
firstNameHash: hash(data.firstName),
lastNameHash: hash(data.lastName)
};

return encryptedData;
};

text

#### 5.2.2 Special Category Data (GDPR Article 9)
// Enhanced encryption for special category data
const encryptSpecialCategoryData = async (data, tenantId) => {
const specialKey = await getSpecialCategoryKey(tenantId);

return {
...data,
medicalInformation: await doubleEncrypt(data.medicalInformation, specialKey),
ethnicOrigin: await doubleEncrypt(data.ethnicOrigin, specialKey),
religiousBeliefs: await doubleEncrypt(data.religiousBeliefs, specialKey)
};
};

text

## 6. Implementation Details

### 6.1 Database Encryption

#### 6.1.1 Amazon RDS Configuration
RDS Encryption Settings
database_encryption:
enabled: true
kms_key: "alias/school-erp-database"
backup_encryption: true
log_encryption: true
performance_insights_encryption: true

Connection encryption
ssl_mode: "require"
ssl_ca_cert: "rds-ca-2019-root.pem"
ssl_cipher: "ECDHE-RSA-AES256-GCM-SHA384"

text

#### 6.1.2 Application-Level Encryption
// Field-level encryption implementation
class FieldEncryption {
constructor(kmsClient, keyId) {
this.kmsClient = kmsClient;
this.keyId = keyId;
}

async encryptField(plaintext, encryptionContext = {}) {
const dataKey = await this.kmsClient.generateDataKey({
KeyId: this.keyId,
EncryptionContext: encryptionContext,
KeySpec: 'AES_256'
}).promise();

text
const cipher = crypto.createCipher('aes-256-gcm', dataKey.Plaintext);
const encrypted = Buffer.concat([
  cipher.update(plaintext, 'utf8'),
  cipher.final()
]);

return {
  encryptedData: encrypted.toString('base64'),
  encryptedDataKey: dataKey.CiphertextBlob.toString('base64'),
  authTag: cipher.getAuthTag().toString('base64')
};
}

async decryptField(encryptedField, encryptionContext = {}) {
const dataKeyResult = await this.kmsClient.decrypt({
CiphertextBlob: Buffer.from(encryptedField.encryptedDataKey, 'base64'),
EncryptionContext: encryptionContext
}).promise();

text
const decipher = crypto.createDecipher('aes-256-gcm', dataKeyResult.Plaintext);
decipher.setAuthTag(Buffer.from(encryptedField.authTag, 'base64'));

const decrypted = Buffer.concat([
  decipher.update(Buffer.from(encryptedField.encryptedData, 'base64')),
  decipher.final()
]);

return decrypted.toString('utf8');
}
}

text

### 6.2 File Storage Encryption

#### 6.2.1 S3 Encryption Configuration
resource "aws_s3_bucket_server_side_encryption_configuration" "school_erp_files" {
bucket = aws_s3_bucket.school_erp_files.id

rule {
apply_server_side_encryption_by_default {
kms_master_key_id = aws_kms_key.s3_storage.arn
sse_algorithm = "aws:kms"
}
bucket_key_enabled = true
}
}

Prevent unencrypted uploads
resource "aws_s3_bucket_policy" "deny_unencrypted_uploads" {
bucket = aws_s3_bucket.school_erp_files.id
policy = jsonencode({
Version = "2012-10-17"
Statement = [
{
Sid = "DenyUnencryptedUploads"
Effect = "Deny"
Principal = ""
Action = "s3:PutObject"
Resource = "${aws_s3_bucket.school_erp_files.arn}/"
Condition = {
StringNotEquals = {
"s3:x-amz-server-side-encryption" = "aws:kms"
}
}
}
]
})
}

text

#### 6.2.2 Application File Encryption
// Client-side encryption before upload
const uploadEncryptedFile = async (file, tenantId, metadata = {}) => {
// Generate tenant-specific encryption key
const encryptionKey = await getTenantEncryptionKey(tenantId);

// Encrypt file contents
const encryptedBuffer = await encryptBuffer(file.buffer, encryptionKey);

// Upload to S3 with server-side encryption
const uploadParams = {
Bucket: process.env.S3_BUCKET,
Key: tenants/${tenantId}/files/${file.originalname},
Body: encryptedBuffer,
ServerSideEncryption: 'aws:kms',
SSEKMSKeyId: process.env.S3_KMS_KEY_ID,
Metadata: {
'tenant-id': tenantId,
'content-type': file.mimetype,
'client-encrypted': 'true',
...metadata
}
};

return await s3.upload(uploadParams).promise();
};

text

### 6.3 Cache Encryption

#### 6.3.1 ElastiCache Redis Configuration
resource "aws_elasticache_replication_group" "school_erp_cache" {
replication_group_id = "${var.project_name}-redis"
description = "Redis cache for School ERP with encryption"

Encryption configuration
at_rest_encryption_enabled = true
transit_encryption_enabled = true
kms_key_id = aws_kms_key.cache.arn

Security
auth_token = random_password.redis_auth.result
security_group_ids = [aws_security_group.redis.id]
subnet_group_name = aws_elasticache_subnet_group.redis.name
}

text

## 7. Compliance Requirements

### 7.1 Regulatory Compliance

#### 7.1.1 GDPR Compliance
- **Article 32**: Encryption as appropriate technical measure
- **Article 25**: Data protection by design and by default
- **Article 35**: Data Protection Impact Assessment requirements

#### 7.1.2 FERPA Compliance (US Educational Records)
- **§ 99.31**: Directory information protection
- **§ 99.35**: Disclosure to authorized representatives

#### 7.1.3 Industry Standards
- **ISO 27001**: Information security management
- **SOC 2 Type II**: Security, availability, confidentiality
- **NIST Cybersecurity Framework**: Protect function implementation

### 7.2 Compliance Monitoring
// Automated compliance checking
const checkEncryptionCompliance = async () => {
const checks = {
rdsEncryption: await checkRDSEncryption(),
s3Encryption: await checkS3Encryption(),
secretsEncryption: await checkSecretsEncryption(),
cacheEncryption: await checkCacheEncryption(),
keyRotation: await checkKeyRotation()
};

const failedChecks = Object.entries(checks)
.filter(([_, result]) => !result.compliant)
.map(([check, result]) => ({ check, issue: result.issue }));

if (failedChecks.length > 0) {
await sendComplianceAlert(failedChecks);
}

return { compliant: failedChecks.length === 0, checks };
};

// Daily compliance check
cron.schedule('0 6 * * *', checkEncryptionCompliance);

text

## 8. Monitoring and Auditing

### 8.1 Encryption Monitoring

#### 8.1.1 CloudWatch Metrics
resource "aws_cloudwatch_metric_alarm" "kms_key_usage" {
alarm_name = "school-erp-kms-key-usage-high"
comparison_operator = "GreaterThanThreshold"
evaluation_periods = "2"
metric_name = "NumberOfRequestsSucceeded"
namespace = "AWS/KMS"
period = "300"
statistic = "Sum"
threshold = "10000"
alarm_description = "This metric monitors KMS key usage"

dimensions = {
KeyId = aws_kms_key.school_erp_primary.key_id
}
}

text

#### 8.1.2 Audit Logging
// Encryption audit logging
const auditEncryptionEvent = async (event) => {
await AuditLog.create({
eventType: 'ENCRYPTION_OPERATION',
operation: event.operation, // ENCRYPT, DECRYPT, KEY_ROTATION
resourceType: event.resourceType,
resourceId: event.resourceId,
userId: event.userId,
tenantId: event.tenantId,
keyId: event.keyId,
success: event.success,
errorMessage: event.error,
metadata: {
encryptionAlgorithm: event.algorithm,
keyLength: event.keyLength,
ipAddress: event.ipAddress,
userAgent: event.userAgent
},
timestamp: new Date()
});
};

text

### 8.2 Key Usage Monitoring
#!/bin/bash

Key usage monitoring script
aws logs create-log-group --log-group-name /aws/kms/key-usage

Monitor for unusual key usage patterns
aws logs put-metric-filter
--log-group-name /aws/cloudtrail
--filter-name unusual-kms-activity
--filter-pattern "{ ($.eventSource = kms.amazonaws.com) && ($.errorCode EXISTS) }"
--metric-transformations
metricName=KMSErrors,
metricNamespace=Security/KMS,
metricValue=1

text

## 9. Incident Response

### 9.1 Encryption Incident Types

#### 9.1.1 Key Compromise Response
1. **Immediate Actions**:
   - Disable compromised key
   - Create new encryption key
   - Rotate all affected data encryption keys
   - Notify security team and stakeholders

2. **Recovery Process**:
const handleKeyCompromise = async (compromisedKeyId) => {
// Disable the compromised key
await kms.disableKey({ KeyId: compromisedKeyId }).promise();

// Create new key
const newKey = await kms.createKey({
Description: 'Replacement key for compromised key',
KeyUsage: 'ENCRYPT_DECRYPT'
}).promise();

// Re-encrypt all data with new key
const affectedResources = await findResourcesUsingKey(compromisedKeyId);

for (const resource of affectedResources) {
await reEncryptResource(resource, newKey.KeyMetadata.KeyId);
}

// Log incident
await logSecurityIncident({
type: 'KEY_COMPROMISE',
severity: 'HIGH',
compromisedKey: compromisedKeyId,
replacementKey: newKey.KeyMetadata.KeyId,
affectedResources: affectedResources.length
});
};

text

#### 9.1.2 Data Breach Response
- **Assessment**: Determine scope of unencrypted data exposure
- **Containment**: Ensure all systems are properly encrypted
- **Notification**: Follow GDPR 72-hour breach notification requirements
- **Recovery**: Implement additional encryption measures

### 9.2 Emergency Key Rotation
#!/bin/bash

Emergency key rotation script
ENVIRONMENT=$1
KEY_ALIAS="alias/school-erp-primary"

echo "Starting emergency key rotation for $ENVIRONMENT..."

Create new key
NEW_KEY=$(aws kms create-key --description "Emergency replacement key" --query 'KeyMetadata.KeyId' --output text)

Update alias to point to new key
aws kms update-alias --alias-name $KEY_ALIAS --target-key-id $NEW_KEY

Schedule data re-encryption
echo "Emergency key rotation completed. New key: $NEW_KEY"

text

## 10. Policy Maintenance

### 10.1 Review Schedule
- **Quarterly Reviews**: Policy effectiveness assessment
- **Annual Reviews**: Full policy update and compliance audit
- **Incident-Triggered Reviews**: After security incidents or breaches
- **Regulatory Updates**: When new compliance requirements are introduced

### 10.2 Policy Updates
- **Version Control**: All policy changes tracked in version control
- **Approval Process**: Changes reviewed by security team and legal counsel
- **Training Updates**: Staff notified of policy changes
- **Implementation Validation**: Technical controls updated to reflect policy changes

### 10.3 Training and Awareness
- **New Employee Training**: Encryption policy overview
- **Annual Refresher**: Policy updates and best practices
- **Incident Response Training**: Key compromise and breach response procedures
- **Developer Training**: Secure coding practices for encryption implementation

---

**Document Information**
- **Version**: 3.1
- **Last Updated**: September 15, 2025
- **Next Review Date**: December 15, 2025
- **Document Owner**: Chief Information Security Officer
- **Approved By**: Data Protection Officer, Chief Technology Officer
- **Classification**: Internal Use Only

**Related Documents**
- Information Security Policy
- Data Protection Policy  
- Key Management Procedures
- Incident Response Plan
- GDPR Compliance Manual