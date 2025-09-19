// src/cli/config-management.js
// #!/usr/bin/env node
import { unifiedConfigurationManager } from "../infrastructure/config/unified-configuration-manager.js";
import { logger } from "#utils/core/logger.js";
import { Command } from "commander";

const program = new Command();

program
  .name('config-mgmt')
  .description('Unified Configuration Management CLI')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize configuration management system')
  .option('--no-secrets', 'Skip secret rotation setup')
  .option('--no-drift', 'Skip drift detection setup')
  .option('--config-paths <paths>', 'Comma-separated config paths to monitor')
  .action(async (options) => {
    try {
      console.log('🚀 Initializing configuration management system...');

      const configPaths = options.configPaths ? options.configPaths.split(',') : [];
      
      const result = await unifiedConfigurationManager.initializeConfigurationManagement({
        enableSecretRotation: options.secrets,
        enableDriftDetection: options.drift,
        configPaths
      });
      
      console.log('\n✅ Configuration management system initialized!');
      console.log(`📊 Components initialized: ${result.initialized.length}`);
      console.log(`⏱️  Initialization time: ${result.duration}ms`);
      
      if (result.failed.length > 0) {
        console.log(`\n⚠️  Failed components: ${result.failed.length}`);
        result.failed.forEach(failure => {
          console.log(`   - ${failure.component}: ${failure.error}`);
        });
      }

    } catch (error) {
      logger.error('Configuration management initialization failed:', error);
      console.error(`\n❌ Initialization failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate configurations')
  .option('-e, --environment <env>', 'Environment to validate')
  .action(async (options) => {
    try {
      console.log(`🔍 Validating configurations${options.environment ? ` for ${options.environment}` : ''}...`);

      const validations = await unifiedConfigurationManager.validateAllConfigurations(options.environment);
      
      const passed = validations.filter(v => v.valid).length;
      const failed = validations.filter(v => !v.valid).length;
      
      console.log(`\n📊 Validation Results:`);
      console.log(`   ✅ Passed: ${passed}`);
      console.log(`   ❌ Failed: ${failed}`);
      
      if (failed > 0) {
        console.log('\n❌ Failed Validations:');
        validations.filter(v => !v.valid).forEach((validation, index) => {
          console.log(`\n${index + 1}. ${validation.configType}.${validation.environment}`);
          validation.errors.forEach(error => {
            console.log(`   - ${error}`);
          });
        });
      }

    } catch (error) {
      logger.error('Configuration validation failed:', error);
      console.error(`\n❌ Validation failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('drift-scan')
  .description('Scan for configuration drift')
  .option('-b, --baseline <name>', 'Baseline name to compare against')
  .action(async (options) => {
    try {
      console.log('🔍 Scanning for configuration drift...');

      const driftScan = await unifiedConfigurationManager.managers.drift.scanForDrift(options.baseline);
      
      console.log(`\n📊 Drift Scan Results:`);
      console.log(`   🔍 Scan ID: ${driftScan.scanId}`);
      console.log(`   📁 Total Configs: ${driftScan.totalConfigs}`);
      console.log(`   🚨 Drifted Configs: ${driftScan.driftedConfigs}`);
      console.log(`   ⏱️  Duration: ${driftScan.duration}ms`);
      
      if (driftScan.driftDetected) {
        console.log('\n🚨 Drift Summary by Severity:');
        Object.entries(driftScan.summary).forEach(([severity, count]) => {
          if (count > 0) {
            const icon = severity === 'critical' ? '🔥' : severity === 'high' ? '⚠️' : 'ℹ️';
            console.log(`   ${icon} ${severity.toUpperCase()}: ${count}`);
          }
        });
        
        console.log('\n📋 Recent Drifts:');
        driftScan.drifts.slice(0, 5).forEach((drift, index) => {
          console.log(`\n${index + 1}. ${drift.configPath}`);
          console.log(`   Severity: ${drift.severity}`);
          console.log(`   Changes: ${drift.changes.length}`);
          console.log(`   Description: ${drift.description}`);
        });
      } else {
        console.log('\n✅ No configuration drift detected!');
      }

    } catch (error) {
      logger.error('Drift scan failed:', error);
      console.error(`\n❌ Drift scan failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('rotate-secrets')
  .description('Rotate secrets')
  .option('-s, --secret <secretId>', 'Specific secret to rotate')
  .action(async (options) => {
    try {
      console.log(`🔄 Rotating secrets${options.secret ? ` (${options.secret})` : ' (all overdue)'}...`);

      const results = await unifiedConfigurationManager.executeSecretRotation(options.secret);
      const resultsArray = Array.isArray(results) ? results : [results];
      
      const successful = resultsArray.filter(r => r.success).length;
      const failed = resultsArray.filter(r => !r.success).length;
      
      console.log(`\n📊 Secret Rotation Results:`);
      console.log(`   ✅ Successful: ${successful}`);
      console.log(`   ❌ Failed: ${failed}`);
      
      if (failed > 0) {
        console.log('\n❌ Failed Rotations:');
        resultsArray.filter(r => !r.success).forEach((result, index) => {
          console.log(`\n${index + 1}. ${result.secretId}`);
          console.log(`   Error: ${result.error}`);
        });
      }

    } catch (error) {
      logger.error('Secret rotation failed:', error);
      console.error(`\n❌ Secret rotation failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('report')
  .description('Generate comprehensive configuration report')
  .action(async (options) => {
    try {
      console.log('📊 Generating comprehensive configuration report...');

      const report = await unifiedConfigurationManager.generateComprehensiveConfigReport();
      
      console.log('\n📋 Configuration System Report');
      console.log('=' .repeat(50));
      console.log(`📅 Generated: ${report.generatedAt.toLocaleString()}`);
      console.log(`🏥 Overall Health: ${report.summary.overallHealth}`);
      console.log(`📁 Total Configurations: ${report.summary.totalConfigurations}`);
      console.log(`✅ Valid Configurations: ${report.summary.validConfigurations}`);
      console.log(`🚨 Drift Detected: ${report.summary.driftDetected ? 'YES' : 'NO'}`);
      console.log(`🔄 Secrets Rotated: ${report.summary.secretsRotated}`);
      
      console.log('\n🔧 Component Status:');
      Object.entries(report.components).forEach(([name, component]) => {
        const status = component.status === 'SUCCESS' ? '✅' : '❌';
        console.log(`   ${status} ${name}: ${component.status}`);
      });
      
      if (report.recommendations.length > 0) {
        console.log('\n💡 Recommendations:');
        report.recommendations.forEach((rec, index) => {
          const priority = rec.priority === 'HIGH' ? '🔥' : rec.priority === 'MEDIUM' ? '⚠️' : 'ℹ️';
          console.log(`\n${index + 1}. ${priority} [${rec.priority}] ${rec.type}`);
          console.log(`   ${rec.message}`);
          console.log(`   Action: ${rec.action}`);
        });
      }

    } catch (error) {
      logger.error('Report generation failed:', error);
      console.error(`\n❌ Report generation failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show configuration management system status')
  .action(async (options) => {
    try {
      const status = unifiedConfigurationManager.getSystemStatus();
      
      console.log('\n🔧 Configuration Management Status:');
      console.log(`   📊 Initialized: ${status.initialized ? 'YES' : 'NO'}`);
      
      console.log('\n📁 Components:');
      console.log(`   ⚙️  Configurations: ${Object.keys(status.components.configuration).length} config types`);
      console.log(`   ✅ Recent Validations: ${status.components.validation.length}`);
      console.log(`   🔐 Active Secrets: ${status.components.secrets}`);
      console.log(`   🔍 Drift Monitoring: ${status.components.drift.active ? 'ACTIVE' : 'INACTIVE'}`);
      
      if (status.components.drift.active) {
        console.log(`       - Watchers: ${status.components.drift.watchers}`);
        console.log(`       - Baselines: ${status.components.drift.baselineConfigs}`);
        console.log(`       - Total Scans: ${status.components.drift.totalScans}`);
        if (status.components.drift.lastScan) {
          console.log(`       - Last Scan: ${new Date(status.components.drift.lastScan).toLocaleString()}`);
        }
      }

    } catch (error) {
      logger.error('Status check failed:', error);
      console.error(`\n❌ Status check failed: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();
