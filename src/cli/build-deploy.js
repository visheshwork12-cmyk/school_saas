// src/cli/build-deploy.js
// #!/usr/bin/env node
import { unifiedBuildDeploymentManager } from "../infrastructure/deployment/unified-build-deployment-manager.js";
import { logger } from "#utils/core/logger.js";
import { Command } from "commander";
import fs from "fs/promises";

const program = new Command();

program
  .name('build-deploy')
  .description('Unified Build & Deployment Management Tool')
  .version('1.0.0');

program
  .command('deploy')
  .description('Execute complete build and deployment pipeline')
  .requiredOption('-s, --service <name>', 'Service name')
  .option('-v, --version <version>', 'Version to deploy', 'latest')
  .option('-n, --namespace <namespace>', 'Kubernetes namespace', 'default')
  .option('-strategy, --deployment-strategy <strategy>', 'Deployment strategy (blue-green|canary|rolling)', 'blue-green')
  .option('-c, --config <path>', 'Configuration file path')
  .option('--skip-build', 'Skip build stage')
  .option('--skip-tests', 'Skip test stage')
  .option('--no-rollback-automation', 'Disable automatic rollback')
  .action(async (options) => {
    try {
      let config = {
        serviceName: options.service,
        version: options.version,
        namespace: options.namespace,
        deploymentStrategy: options.deploymentStrategy,
        enableRollbackAutomation: options.rollbackAutomation
      };

      // Load config file if provided
      if (options.config) {
        try {
          const configData = await fs.readFile(options.config, 'utf-8');
          const fileConfig = JSON.parse(configData);
          config = { ...config, ...fileConfig };
        } catch (error) {
          logger.warn(`Failed to load config file: ${options.config}`);
        }
      }

      logger.info(`Starting deployment pipeline for ${config.serviceName}`);
      console.log(`🚀 Deploying ${config.serviceName} (${config.version}) using ${config.deploymentStrategy} strategy`);

      const result = await unifiedBuildDeploymentManager.executeCompletePipeline(config);
      
      if (result.success) {
        console.log('\n✅ Deployment completed successfully!');
        console.log(`📊 Pipeline Summary:`);
        console.log(`   • Duration: ${Math.round(result.duration / 1000)}s`);
        console.log(`   • Stages completed: ${result.stages.filter(s => s.status === 'completed').length}/${result.stages.length}`);
        console.log(`   • Strategy: ${config.deploymentStrategy}`);
        
        if (result.stages.find(s => s.stage === 'build')?.result?.cacheAnalysis) {
          const cacheHitRatio = result.stages.find(s => s.stage === 'build').result.cacheAnalysis.hitRatio;
          console.log(`   • Cache hit ratio: ${cacheHitRatio}%`);
        }
      } else {
        console.log('\n❌ Deployment failed!');
        console.log('Check logs for details and consider rollback if needed.');
        process.exit(1);
      }

    } catch (error) {
      logger.error('Deployment failed:', error);
      console.error(`\n❌ Deployment failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('rollback')
  .description('Rollback service to previous version')
  .requiredOption('-s, --service <name>', 'Service name')
  .option('-n, --namespace <namespace>', 'Kubernetes namespace', 'default')
  .option('-m, --method <method>', 'Rollback method (auto-detect|blue-green|canary|rolling)', 'auto-detect')
  .action(async (options) => {
    try {
      logger.info(`Rolling back service: ${options.service}`);
      console.log(`🔄 Rolling back ${options.service}...`);

      const result = await unifiedBuildDeploymentManager.rollbackToPreviousVersion(
        options.service,
        options.namespace,
        { method: options.method }
      );
      
      if (result.success) {
        console.log('\n✅ Rollback completed successfully!');
        console.log(`📊 Rollback Summary:`);
        console.log(`   • Duration: ${Math.round(result.duration / 1000)}s`);
        console.log(`   • Method: ${result.method}`);
      } else {
        console.log('\n❌ Rollback failed!');
        console.error(result.error || 'Unknown error occurred');
        process.exit(1);
      }

    } catch (error) {
      logger.error('Rollback failed:', error);
      console.error(`\n❌ Rollback failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('promote')
  .description('Promote service between environments')
  .requiredOption('-s, --service <name>', 'Service name')
  .requiredOption('-f, --from <env>', 'Source environment')
  .requiredOption('-t, --to <env>', 'Target environment')
  .option('-strategy, --deployment-strategy <strategy>', 'Deployment strategy for promotion', 'blue-green')
  .action(async (options) => {
    try {
      logger.info(`Promoting ${options.service} from ${options.from} to ${options.to}`);
      console.log(`📈 Promoting ${options.service}: ${options.from} → ${options.to}`);

      const result = await unifiedBuildDeploymentManager.promoteToEnvironment(
        options.service,
        options.from,
        options.to,
        { deploymentStrategy: options.deploymentStrategy }
      );
      
      if (result.success) {
        console.log('\n✅ Environment promotion completed successfully!');
        console.log(`📊 Promotion Summary:`);
        console.log(`   • Duration: ${Math.round(result.duration / 1000)}s`);
        console.log(`   • Stages completed: ${result.stages.filter(s => s.status === 'completed').length}/${result.stages.length}`);
      } else {
        console.log('\n❌ Environment promotion failed!');
        process.exit(1);
      }

    } catch (error) {
      logger.error('Environment promotion failed:', error);
      console.error(`\n❌ Promotion failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('optimize')
  .description('Optimize build and deployment pipeline')
  .requiredOption('-s, --service <name>', 'Service name')
  .action(async (options) => {
    try {
      logger.info(`Optimizing pipeline for: ${options.service}`);
      console.log(`⚡ Analyzing and optimizing pipeline for ${options.service}...`);

      const result = await unifiedBuildDeploymentManager.optimizePipeline(options.service);
      
      console.log('\n📊 Optimization Results:');
      console.log(`   • Total recommendations: ${result.summary.totalRecommendations}`);
      console.log(`   • Categories: ${result.summary.categories.join(', ')}`);
      console.log(`   • Estimated impact: ${result.summary.estimatedImpact}`);
      
      if (result.summary.totalRecommendations > 0) {
        console.log('\n💡 Top recommendations:');
        result.optimizations.forEach((opt, index) => {
          console.log(`   ${index + 1}. ${opt.type}:`);
          opt.recommendations.forEach(rec => {
            console.log(`      - ${rec}`);
          });
        });
      }

    } catch (error) {
      logger.error('Pipeline optimization failed:', error);
      console.error(`\n❌ Optimization failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show pipeline status and statistics')
  .option('-s, --service <name>', 'Filter by service name')
  .option('-l, --limit <number>', 'Limit number of results', '10')
  .action(async (options) => {
    try {
      const stats = unifiedBuildDeploymentManager.getPipelineStatistics();
      const history = unifiedBuildDeploymentManager.getPipelineHistory(options.service, parseInt(options.limit));
      
      console.log('\n📊 Pipeline Statistics:');
      console.log(`   • Total pipelines: ${stats.totalPipelines}`);
      console.log(`   • Success rate: ${stats.totalPipelines > 0 ? Math.round((stats.successfulPipelines / stats.totalPipelines) * 100) : 0}%`);
      console.log(`   • Average duration: ${Math.round(stats.averageDuration / 1000)}s`);
      console.log(`   • Most used strategy: ${stats.mostUsedStrategy}`);
      console.log(`   • Average cache efficiency: ${Math.round(stats.cacheEfficiency)}%`);
      
      if (history.length > 0) {
        console.log(`\n📋 Recent Pipelines (${options.service || 'all services'}):`);
        history.forEach((pipeline, index) => {
          const status = pipeline.success ? '✅' : '❌';
          const duration = Math.round(pipeline.duration / 1000);
          console.log(`   ${index + 1}. ${status} ${pipeline.serviceName} - ${duration}s (${new Date(pipeline.startTime).toLocaleString()})`);
        });
      }

    } catch (error) {
      logger.error('Failed to get status:', error);
      console.error(`\n❌ Failed to get status: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();
