const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

async function validateCloudFrontPolicies() {
  const policyFiles = [
    'security/policies/cloudfront/cloudfront-service-role-policy.json',
    'security/policies/s3/s3-cloudfront-access-policy.json',
    'security/policies/iam/application-cloudfront-policy.json'
  ];

  for (const policyFile of policyFiles) {
    try {
      const policy = JSON.parse(fs.readFileSync(policyFile, 'utf8'));
      console.log(`✅ ${policyFile} - Valid JSON`);
      
      // Validate policy syntax with AWS
      const iam = new AWS.IAM();
      await iam.simulatePrincipalPolicy({
        PolicySourceArn: 'arn:aws:iam::123456789012:user/test',
        ActionNames: ['s3:GetObject'],
        PolicyInputList: [JSON.stringify(policy)]
      }).promise();
      
      console.log(`✅ ${policyFile} - Policy syntax valid`);
    } catch (error) {
      console.error(`❌ ${policyFile} - Error:`, error.message);
    }
  }
}

validateCloudFrontPolicies();
