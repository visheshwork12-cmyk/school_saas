import { WAFv2Client, CreateWebACLCommand } from "@aws-sdk/client-wafv2";
import { logger } from "#utils/core/logger.js";

class WAFSetup {
  constructor() {
    this.wafClient = new WAFv2Client({ region: 'us-east-1' }); // CloudFront requires us-east-1
  }

  async setupWAF() {
    try {
      const webACLConfig = {
        Name: `school-erp-waf-${process.env.NODE_ENV}`,
        Scope: 'CLOUDFRONT',
        DefaultAction: { Allow: {} },
        Rules: [
          {
            Name: 'RateLimitRule',
            Priority: 1,
            Statement: {
              RateBasedStatement: {
                Limit: 2000,
                AggregateKeyType: 'IP'
              }
            },
            Action: { Block: {} },
            VisibilityConfig: {
              SampledRequestsEnabled: true,
              CloudWatchMetricsEnabled: true,
              MetricName: 'RateLimitRule'
            }
          },
          {
            Name: 'SQLInjectionRule',
            Priority: 2,
            Statement: {
              ManagedRuleGroupStatement: {
                VendorName: 'AWS',
                Name: 'AWSManagedRulesSQLiRuleSet'
              }
            },
            OverrideAction: { None: {} },
            VisibilityConfig: {
              SampledRequestsEnabled: true,
              CloudWatchMetricsEnabled: true,
              MetricName: 'SQLInjectionRule'
            }
          }
        ],
        VisibilityConfig: {
          SampledRequestsEnabled: true,
          CloudWatchMetricsEnabled: true,
          MetricName: 'schoolERPWAF'
        }
      };

      const command = new CreateWebACLCommand(webACLConfig);
      const result = await this.wafClient.send(command);
      
      logger.info('✅ WAF Web ACL created successfully', { 
        webAclId: result.Summary.Id,
        webAclArn: result.Summary.ARN 
      });

      return result.Summary.ARN;
    } catch (error) {
      logger.error('❌ WAF setup failed:', error);
      throw error;
    }
  }
}

export default WAFSetup;
