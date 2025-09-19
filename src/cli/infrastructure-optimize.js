// src/cli/infrastructure-optimize.js
// #!/usr/bin/env node
import { unifiedInfrastructureOptimizer } from "../infrastructure/optimization/unified-infrastructure-optimizer.js";
import { logger } from "#utils/core/logger.js";
import { Command } from "commander";

const program = new Command();

program
  .name('infrastructure-optimizer')
  .description('Comprehensive infrastructure optimization tool')
  .version('1.0.0');

program
  .command('optimize')
  .description('Run comprehensive infrastructure optimization')
  .option('-d, --deployments <deployments>', 'Deployment configurations (JSON file)', 'deployments.json')
  .option('--no-auto-scaling', 'Skip auto-scaling optimization')
  .option('--no-load-balancer', 'Skip load balancer optimization')
  .option('--no-resources', 'Skip resource optimization')
  .option('--no-hpa-vpa', 'Skip HPA/VPA optimization')
  .option('--no-aws-services', 'Skip AWS services optimization')
  .option('--apply', 'Apply recommendations automatically (default: dry-run)')
  .action(async (options) => {
    try {
      // Load deployment configurations
      let deployments = [];
      try {
        const deploymentsData = await fs.readFile(options.deployments, 'utf-8');
        deployments = JSON.parse(deploymentsData);
      } catch (error) {
        logger.warn(`Could not load deployments file: ${options.deployments}`);
      }

      const optimizationOptions = {
        deployments,
        autoScaling: options.autoScaling,
        loadBalancer: options.loadBalancer,
        resources: options.resources,
        hpaVpa: options.hpaVpa,
        awsServices: options.awsServices,
        applyRecommendations: options.apply
      };

      logger.info('Starting infrastructure optimization...');
      const results = await unifiedInfrastructureOptimizer.executeCompleteOptimization(optimizationOptions);
      
      console.log('\n🚀 Infrastructure optimization completed successfully!\n');
      console.log('📊 Summary:');
      console.log(`   • Total optimizations: ${results.summary.totalOptimizations}`);
      console.log(`   • Estimated monthly savings: $${results.summary.estimatedMonthlySavings}`);
      console.log(`   • Execution time: ${results.executionTime}ms`);
      
      if (results.recommendations.length > 0) {
        console.log('\n💡 Top recommendations:');
        results.recommendations.slice(0, 5).forEach((rec, index) => {
          console.log(`   ${index + 1}. ${rec.type}: ${rec.message || rec.description} (${rec.priority} priority)`);
        });
      }

      console.log(`\n📄 Detailed report saved to: reports/infrastructure-optimization/`);

    } catch (error) {
      logger.error('Infrastructure optimization failed:', error);
      process.exit(1);
    }
  });

program
  .command('monitor')
  .description('Start continuous infrastructure monitoring')
  .action(async () => {
    try {
      logger.info('Starting continuous infrastructure monitoring...');
      
      // Start all monitoring services
      await unifiedInfrastructureOptimizer.optimizers.autoScaling.monitorScalingActivities();
      await unifiedInfrastructureOptimizer.optimizers.loadBalancer.monitorLoadBalancerPerformance();
      unifiedInfrastructureOptimizer.optimizers.resources.startResourceMonitoring();
      await unifiedInfrastructureOptimizer.optimizers.hpaVpa.monitorAutoscalingActivities();
      await unifiedInfrastructureOptimizer.optimizers.awsServices.monitorAWSServicesPerformance();
      
      console.log('✅ Infrastructure monitoring started successfully');
      console.log('🔍 Monitoring all infrastructure components...');
      console.log('📊 Reports will be generated automatically');
      
      // Keep the process running
      process.on('SIGINT', () => {
        console.log('\n👋 Stopping infrastructure monitoring...');
        process.exit(0);
      });

    } catch (error) {
      logger.error('Infrastructure monitoring failed:', error);
      process.exit(1);
    }
  });

program.parse();
