// src/cli/monitoring.js
// #!/usr/bin/env node
import { unifiedMonitoringManager } from "../infrastructure/monitoring/unified-monitoring-manager.js";
import { logger } from "#utils/core/logger.js";
import { Command } from "commander";

const program = new Command();

program
  .name('monitoring')
  .description('Unified Monitoring & Analytics Management Tool')
  .version('1.0.0');

program
  .command('start')
  .description('Start comprehensive monitoring')
  .option('--no-business', 'Disable business metrics')
  .option('--no-performance', 'Disable performance profiling')
  .option('--no-errors', 'Disable error tracking')
  .option('--no-behavior', 'Disable behavior analytics')
  .option('--no-resources', 'Disable resource monitoring')
  .option('--start-profiling', 'Start performance profiling immediately')
  .action(async (options) => {
    try {
      console.log('🚀 Starting unified monitoring system...');

      const config = {
        enableBusinessMetrics: options.business,
        enablePerformanceProfiling: options.performance,
        enableErrorTracking: options.errors,
        enableBehaviorAnalytics: options.behavior,
        enableResourceMonitoring: options.resources,
        startProfiling: options.startProfiling
      };

      const result = await unifiedMonitoringManager.initializeMonitoring(config);
      
      console.log('\n✅ Monitoring system started successfully!');
      console.log(`📊 Components initialized: ${result.initialized.length}`);
      console.log(`⏱️  Initialization time: ${result.duration}ms`);
      
      if (result.failed.length > 0) {
        console.log(`\n⚠️  Failed components: ${result.failed.length}`);
        result.failed.forEach(failure => {
          console.log(`   - ${failure.component}: ${failure.error}`);
        });
      }

      console.log('\n📈 Monitoring dashboard: http://localhost:3000/monitoring');

    } catch (error) {
      logger.error('Failed to start monitoring:', error);
      console.error(`\n❌ Monitoring startup failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('report')
  .description('Generate comprehensive monitoring report')
  .option('-t, --time-range <range>', 'Time range for report (1h, 24h, 7d)', '24h')
  .option('-o, --output <file>', 'Output file for report')
  .action(async (options) => {
    try {
      console.log(`📊 Generating monitoring report for ${options.timeRange}...`);

      const report = await unifiedMonitoringManager.generateComprehensiveReport({
        timeRange: options.timeRange
      });
      
      console.log('\n✅ Monitoring report generated successfully!');
      console.log(`📋 Report ID: ${report.reportId}`);
      console.log(`🏥 Overall Health: ${report.summary.overallHealth}`);
      console.log(`🚨 Total Alerts: ${report.summary.totalAlerts}`);
      console.log(`⚡ Performance Score: ${report.summary.performanceScore}/100`);
      
      if (report.summary.criticalIssues > 0) {
        console.log(`\n🔥 Critical Issues: ${report.summary.criticalIssues}`);
      }

      // Component status
      console.log('\n📊 Component Status:');
      Object.entries(report.components).forEach(([name, component]) => {
        const status = component.status === 'SUCCESS' ? '✅' : '❌';
        const health = component.health || 'UNKNOWN';
        console.log(`   ${status} ${name}: ${health}`);
      });

      if (options.output) {
        await fs.writeFile(options.output, JSON.stringify(report, null, 2));
        console.log(`\n💾 Report saved to: ${options.output}`);
      }

    } catch (error) {
      logger.error('Failed to generate report:', error);
      console.error(`\n❌ Report generation failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('alerts')
  .description('Show active alerts')
  .option('-c, --component <component>', 'Filter by component')
  .option('-s, --severity <severity>', 'Filter by severity')
  .action(async (options) => {
    try {
      let alerts = unifiedMonitoringManager.getActiveAlerts();
      
      if (options.component) {
        alerts = alerts.filter(alert => alert.component === options.component);
      }
      
      if (options.severity) {
        alerts = alerts.filter(alert => alert.originalAlert.severity === options.severity);
      }

      console.log(`\n🚨 Active Alerts: ${alerts.length}`);
      
      if (alerts.length === 0) {
        console.log('✅ No active alerts');
        return;
      }

      alerts.forEach((alert, index) => {
        const severity = alert.originalAlert.severity || 'UNKNOWN';
        const icon = severity === 'CRITICAL' ? '🔥' : severity === 'WARNING' ? '⚠️' : 'ℹ️';
        console.log(`\n${index + 1}. ${icon} [${severity}] ${alert.component}`);
        console.log(`   Message: ${alert.originalAlert.message}`);
        console.log(`   Time: ${alert.timestamp.toLocaleString()}`);
        
        if (alert.correlations.length > 0) {
          console.log(`   Correlations: ${alert.correlations.length} related alerts`);
        }
      });

    } catch (error) {
      logger.error('Failed to get alerts:', error);
      console.error(`\n❌ Failed to retrieve alerts: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show monitoring system status')
  .action(async (options) => {
    try {
      const status = unifiedMonitoringManager.getMonitoringStatus();
      const activeAlerts = unifiedMonitoringManager.getActiveAlerts();
      
      console.log('\n📊 Monitoring System Status:');
      
      Object.entries(status).forEach(([component, componentStatus]) => {
        const icon = componentStatus === 'ACTIVE' ? '✅' : '❌';
        console.log(`   ${icon} ${component}: ${componentStatus}`);
      });
      
      console.log(`\n🚨 Active Alerts: ${activeAlerts.length}`);
      
      if (activeAlerts.length > 0) {
        const critical = activeAlerts.filter(a => a.originalAlert.severity === 'CRITICAL').length;
        const warning = activeAlerts.filter(a => a.originalAlert.severity === 'WARNING').length;
        
        if (critical > 0) console.log(`   🔥 Critical: ${critical}`);
        if (warning > 0) console.log(`   ⚠️  Warning: ${warning}`);
      }

    } catch (error) {
      logger.error('Failed to get status:', error);
      console.error(`\n❌ Failed to retrieve status: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();
