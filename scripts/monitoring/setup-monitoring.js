// scripts/monitoring/setup-monitoring.js - Monitoring infrastructure setup
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import chalk from 'chalk';

import { logger } from '#utils/core/logger.js';
import baseConfig from '#shared/config/environments/base.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

class MonitoringSetup {
  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.deploymentType = this.detectDeploymentType();
    this.monitoringDir = path.join(projectRoot, 'monitoring');
  }

  detectDeploymentType() {
    if (process.env.VERCEL) return 'vercel';
    if (process.env.NETLIFY) return 'netlify';
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) return 'aws-lambda';
    if (process.env.KUBERNETES_SERVICE_HOST) return 'kubernetes';
    if (process.env.DOCKER_CONTAINER) return 'docker';
    return 'traditional';
  }

  log(message, level = 'info') {
    const colors = {
      info: chalk.blue,
      success: chalk.green,
      warn: chalk.yellow,
      error: chalk.red
    };
    
    console.log(`${colors[level](`[${level.toUpperCase()}]`)} ${message}`);
  }

  async setupMonitoringInfrastructure() {
    try {
      this.log('🔧 Setting up monitoring infrastructure...');

      // Create monitoring directories
      await this.createDirectories();

      // Setup platform-specific monitoring
      switch (this.deploymentType) {
        case 'aws-lambda':
        case 'kubernetes':
          await this.setupPrometheusMonitoring();
          await this.setupCloudWatchIntegration();
          break;
        case 'docker':
          await this.setupDockerMonitoring();
          break;
        case 'vercel':
          await this.setupVercelMonitoring();
          break;
        default:
          await this.setupTraditionalMonitoring();
      }

      // Setup health checks
      await this.setupHealthChecks();

      // Setup alerting
      await this.setupAlerting();

      // Setup dashboards
      await this.setupDashboards();

      this.log('✅ Monitoring infrastructure setup completed', 'success');

    } catch (error) {
      this.log(`❌ Monitoring setup failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async createDirectories() {
    const dirs = [
      'monitoring',
      'monitoring/health-checks',
      'monitoring/prometheus',
      'monitoring/grafana',
      'monitoring/alertmanager',
      'monitoring/dashboards',
      'monitoring/scripts',
      'monitoring/config'
    ];

    for (const dir of dirs) {
      const fullPath = path.join(projectRoot, dir);
      await fs.mkdir(fullPath, { recursive: true });
    }

    this.log('📁 Created monitoring directories');
  }

  async setupPrometheusMonitoring() {
    this.log('📊 Setting up Prometheus monitoring...');

    // Prometheus configuration
    const prometheusConfig = `
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  - job_name: 'school-erp-api'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 10s
    
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']
      
  - job_name: 'mongodb-exporter'
    static_configs:
      - targets: ['localhost:9216']
      
  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['localhost:9121']
`;

    await fs.writeFile(
      path.join(this.monitoringDir, 'prometheus/prometheus.yml'),
      prometheusConfig
    );

    // Alert rules
    const alertRules = `
groups:
  - name: school-erp-alerts
    rules:
      - alert: HighResponseTime
        expr: http_request_duration_seconds{quantile="0.95"} > 2
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High response time detected"
          description: "95th percentile response time is {{ $value }}s"

      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} requests per second"

      - alert: DatabaseDown
        expr: up{job="mongodb-exporter"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Database is down"
          description: "MongoDB is not responding"

      - alert: HighMemoryUsage
        expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.9
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Memory usage is above 90%"
`;

    await fs.writeFile(
      path.join(this.monitoringDir, 'prometheus/alert_rules.yml'),
      alertRules
    );

    this.log('✅ Prometheus configuration created');
  }

  async setupCloudWatchIntegration() {
    this.log('☁️ Setting up CloudWatch integration...');

    const cloudWatchConfig = {
      region: baseConfig.aws?.region || 'us-east-1',
      namespace: 'SchoolERP/Application',
      metrics: [
        {
          name: 'ResponseTime',
          unit: 'Milliseconds',
          dimensions: [
            { name: 'Environment', value: this.environment },
            { name: 'Service', value: 'API' }
          ]
        },
        {
          name: 'ErrorRate',
          unit: 'Count',
          dimensions: [
            { name: 'Environment', value: this.environment },
            { name: 'Service', value: 'API' }
          ]
        },
        {
          name: 'RequestCount',
          unit: 'Count',
          dimensions: [
            { name: 'Environment', value: this.environment },
            { name: 'Service', value: 'API' }
          ]
        }
      ]
    };

    await fs.writeFile(
      path.join(this.monitoringDir, 'config/cloudwatch.json'),
      JSON.stringify(cloudWatchConfig, null, 2)
    );

    this.log('✅ CloudWatch configuration created');
  }

  async setupDockerMonitoring() {
    this.log('🐳 Setting up Docker monitoring...');

    const dockerComposeMonitoring = `
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./prometheus/alert_rules.yml:/etc/prometheus/alert_rules.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--storage.tsdb.retention.time=200h'
      - '--web.enable-lifecycle'
    networks:
      - monitoring

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
      - ./grafana/dashboards:/var/lib/grafana/dashboards
    networks:
      - monitoring

  node-exporter:
    image: prom/node-exporter:latest
    container_name: node-exporter
    ports:
      - "9100:9100"
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.rootfs=/rootfs'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    networks:
      - monitoring

  alertmanager:
    image: prom/alertmanager:latest
    container_name: alertmanager
    ports:
      - "9093:9093"
    volumes:
      - ./alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml
    networks:
      - monitoring

volumes:
  prometheus_data:
  grafana_data:

networks:
  monitoring:
    driver: bridge
`;

    await fs.writeFile(
      path.join(this.monitoringDir, 'docker-compose.monitoring.yml'),
      dockerComposeMonitoring
    );

    this.log('✅ Docker monitoring stack configured');
  }

  async setupVercelMonitoring() {
    this.log('▲ Setting up Vercel monitoring...');

    // Vercel analytics configuration
    const vercelConfig = {
      analytics: {
        enabled: true,
        trackingId: process.env.VERCEL_ANALYTICS_ID
      },
      speedInsights: {
        enabled: true
      },
      monitoring: {
        functions: true,
        bandwidth: true,
        errors: true
      }
    };

    await fs.writeFile(
      path.join(this.monitoringDir, 'config/vercel.json'),
      JSON.stringify(vercelConfig, null, 2)
    );

    this.log('✅ Vercel monitoring configured');
  }

  async setupTraditionalMonitoring() {
    this.log('🏗️ Setting up traditional monitoring...');

    // PM2 ecosystem file for monitoring
    const pm2Config = {
      apps: [
        {
          name: 'school-erp-api',
          script: 'src/server.js',
          instances: 'max',
          exec_mode: 'cluster',
          env: {
            NODE_ENV: 'production',
            PORT: 3000
          },
          monitoring: true,
          pmx: true
        },
        {
          name: 'health-monitor',
          script: 'scripts/monitoring/health-monitor.js',
          instances: 1,
          exec_mode: 'fork',
          env: {
            NODE_ENV: 'production'
          }
        }
      ]
    };

    await fs.writeFile(
      path.join(this.monitoringDir, 'config/ecosystem.json'),
      JSON.stringify(pm2Config, null, 2)
    );

    this.log('✅ Traditional monitoring configured');
  }

  async setupHealthChecks() {
    this.log('🏥 Setting up health checks...');

    // Kubernetes health checks
    if (this.deploymentType === 'kubernetes') {
      const healthCheckConfig = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: health-check-config
data:
  health-check.sh: |
    #!/bin/bash
    response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)
    if [ $response -eq 200 ]; then
      exit 0
    else
      exit 1
    fi
`;

      await fs.writeFile(
        path.join(this.monitoringDir, 'health-checks/k8s-health-check.yaml'),
        healthCheckConfig
      );
    }

    // Docker health check
    const dockerHealthCheck = `
#!/bin/bash
set -e

echo "Running Docker health check..."

# Check main application
if ! curl -f http://localhost:3000/health >/dev/null 2>&1; then
    echo "Health check failed: Application not responding"
    exit 1
fi

# Check database connection
if ! curl -f http://localhost:3000/health/database >/dev/null 2>&1; then
    echo "Health check failed: Database not responding"
    exit 1
fi

echo "Health check passed"
exit 0
`;

    await fs.writeFile(
      path.join(this.monitoringDir, 'health-checks/docker-health-check.sh'),
      dockerHealthCheck
    );

    // Make script executable
    try {
      execSync(`chmod +x ${path.join(this.monitoringDir, 'health-checks/docker-health-check.sh')}`);
    } catch (error) {
      this.log('⚠️ Could not make health check script executable', 'warn');
    }

    this.log('✅ Health checks configured');
  }

  async setupAlerting() {
    this.log('🚨 Setting up alerting...');

    const alertManagerConfig = `
global:
  smtp_smarthost: '${baseConfig.email?.smtp?.host}:${baseConfig.email?.smtp?.port}'
  smtp_from: '${baseConfig.email?.smtp?.from || 'alerts@school-erp.com'}'

route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'web.hook'

receivers:
  - name: 'web.hook'
    email_configs:
      - to: '${process.env.ALERT_EMAIL || 'admin@school-erp.com'}'
        subject: 'School ERP Alert: {{ .GroupLabels.alertname }}'
        body: |
          {{ range .Alerts }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          {{ end }}
    
    webhook_configs:
      - url: '${process.env.ALERT_WEBHOOK_URL || 'http://localhost:3000/webhooks/alerts'}'
        send_resolved: true

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'dev', 'instance']
`;

    await fs.writeFile(
      path.join(this.monitoringDir, 'alertmanager/alertmanager.yml'),
      alertManagerConfig
    );

    this.log('✅ Alerting configured');
  }

  async setupDashboards() {
    this.log('📊 Setting up monitoring dashboards...');

    // Grafana dashboard configuration
    const grafanaDashboard = {
      dashboard: {
        id: null,
        title: "School ERP SaaS Monitoring",
        panels: [
          {
            title: "API Response Time",
            type: "graph",
            targets: [
              {
                expr: "http_request_duration_seconds{quantile=\"0.95\"}",
                legendFormat: "95th percentile"
              }
            ]
          },
          {
            title: "Request Rate",
            type: "graph",
            targets: [
              {
                expr: "rate(http_requests_total[5m])",
                legendFormat: "Requests per second"
              }
            ]
          },
          {
            title: "Error Rate",
            type: "graph",
            targets: [
              {
                expr: "rate(http_requests_total{status=~\"5..\"}[5m])",
                legendFormat: "Error rate"
              }
            ]
          },
          {
            title: "Database Connections",
            type: "graph",
            targets: [
              {
                expr: "mongodb_connections",
                legendFormat: "Active connections"
              }
            ]
          }
        ]
      }
    };

    await fs.writeFile(
      path.join(this.monitoringDir, 'dashboards/school-erp-dashboard.json'),
      JSON.stringify(grafanaDashboard, null, 2)
    );

    this.log('✅ Dashboards configured');
  }

  async generateStartupScript() {
    this.log('📝 Generating startup script...');

    const startupScript = `
#!/bin/bash
set -e

echo "🚀 Starting School ERP monitoring stack..."

# Check if monitoring is already running
if docker-compose -f monitoring/docker-compose.monitoring.yml ps | grep -q "Up"; then
    echo "⚠️ Monitoring stack is already running"
    exit 0
fi

# Start monitoring stack
echo "📊 Starting Prometheus, Grafana, and AlertManager..."
docker-compose -f monitoring/docker-compose.monitoring.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service health
echo "🏥 Checking service health..."
curl -f http://localhost:9090/-/healthy || echo "⚠️ Prometheus not ready"
curl -f http://localhost:3001/api/health || echo "⚠️ Grafana not ready"
curl -f http://localhost:9093/-/healthy || echo "⚠️ AlertManager not ready"

echo "✅ Monitoring stack started successfully!"
echo "📊 Prometheus: http://localhost:9090"
echo "📈 Grafana: http://localhost:3001 (admin/admin)"
echo "🚨 AlertManager: http://localhost:9093"
`;

    await fs.writeFile(
      path.join(this.monitoringDir, 'scripts/start-monitoring.sh'),
      startupScript
    );

    // Make script executable
    try {
      execSync(`chmod +x ${path.join(this.monitoringDir, 'scripts/start-monitoring.sh')}`);
    } catch (error) {
      this.log('⚠️ Could not make startup script executable', 'warn');
    }

    this.log('✅ Startup script generated');
  }

  async run() {
    try {
      this.log(`🔧 Setting up monitoring for ${this.deploymentType} deployment in ${this.environment} environment`);
      
      await this.setupMonitoringInfrastructure();
      await this.generateStartupScript();
      
      this.log('🎉 Monitoring setup completed successfully!', 'success');
      this.log('📖 Check the monitoring/ directory for configuration files', 'info');
      
      if (this.deploymentType === 'docker' || this.deploymentType === 'traditional') {
        this.log('🚀 Start monitoring with: ./monitoring/scripts/start-monitoring.sh', 'info');
      }

    } catch (error) {
      this.log(`💥 Setup failed: ${error.message}`, 'error');
      process.exit(1);
    }
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new MonitoringSetup();
  setup.run();
}

export default MonitoringSetup;
