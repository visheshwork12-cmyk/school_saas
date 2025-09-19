// src/infrastructure/testing/chaos-engineering-manager.js
import { logger } from "#utils/core/logger.js";
import { EventEmitter } from "events";
import { execSync } from "child_process";
import fs from "fs/promises";
import path from "path";

/**
 * Chaos Engineering Manager
 * Implements chaos experiments to test system resilience
 */
export class ChaosEngineeringManager extends EventEmitter {
  constructor() {
    super();
    this.chaosExperiments = new Map();
    this.experimentResults = new Map();
    this.chaosTools = new Map();
    this.resilenceBaselines = new Map();
    this.recoveryStrategies = new Map();
    this.initializeChaosEngineering();
  }

  /**
   * Initialize chaos engineering framework
   */
  initializeChaosEngineering() {
    this.setupChaosTools();
    this.setupChaosExperiments();
    this.setupRecoveryStrategies();
  }

  /**
   * Setup chaos engineering tools
   */
  setupChaosTools() {
    // Chaos Mesh (Kubernetes)
    this.addChaosTool('CHAOS_MESH', {
      name: 'Chaos Mesh',
      description: 'Cloud-native chaos engineering platform',
      platform: 'kubernetes',
      execute: async (experiment) => {
        return await this.executeChaoseMeshExperiment(experiment);
      },
      manifests: {
        podChaos: this.generatePodChaosManifest,
        networkChaos: this.generateNetworkChaosManifest,
        ioChaos: this.generateIOChaosManifest
      }
    });

    // Gremlin
    this.addChaosTool('GREMLIN', {
      name: 'Gremlin',
      description: 'Failure as a Service platform',
      platform: 'cloud',
      execute: async (experiment) => {
        return await this.executeGremlinExperiment(experiment);
      },
      api: 'https://api.gremlin.com/v1'
    });

    // Litmus
    this.addChaosTool('LITMUS', {
      name: 'Litmus',
      description: 'Open source chaos engineering platform',
      platform: 'kubernetes',
      execute: async (experiment) => {
        return await this.executeLitmusExperiment(experiment);
      },
      workflows: {
        podDelete: this.generateLitmusPodDeleteWorkflow,
        cpuHog: this.generateLitmusCPUHogWorkflow,
        memoryHog: this.generateLitmusMemoryHogWorkflow
      }
    });

    // Custom Chaos Tool
    this.addChaosTool('CUSTOM', {
      name: 'Custom Chaos Scripts',
      description: 'Custom chaos injection scripts',
      platform: 'any',
      execute: async (experiment) => {
        return await this.executeCustomChaosScript(experiment);
      },
      scripts: new Map()
    });
  }

  /**
   * Setup chaos experiments
   */
  setupChaosExperiments() {
    // Pod Failure Experiment
    this.addChaosExperiment('POD_FAILURE', {
      name: 'Pod Failure Simulation',
      description: 'Tests system resilience to pod failures',
      hypothesis: 'System should continue operating when individual pods fail',
      tool: 'CHAOS_MESH',
      type: 'pod_chaos',
      parameters: {
        action: 'pod-kill',
        mode: 'random-max-percent',
        value: '50',
        duration: '60s'
      },
      scope: {
        namespaces: ['school-erp-api', 'school-erp-frontend'],
        labelSelectors: ['app=school-erp']
      },
      monitoring: {
        metrics: ['availability', 'response_time', 'error_rate'],
        duration: '300s',
        baseline_window: '300s'
      }
    });

    // Network Partition Experiment
    this.addChaosExperiment('NETWORK_PARTITION', {
      name: 'Network Partition Simulation',
      description: 'Tests system behavior during network splits',
      hypothesis: 'System should handle network partitions gracefully',
      tool: 'CHAOS_MESH',
      type: 'network_chaos',
      parameters: {
        action: 'partition',
        mode: 'random-max-percent',
        value: '50',
        duration: '120s',
        direction: 'both'
      },
      scope: {
        namespaces: ['school-erp-api'],
        services: ['api-service', 'database-service']
      },
      monitoring: {
        metrics: ['connectivity', 'data_consistency', 'failover_time'],
        duration: '600s'
      }
    });

    // High CPU Load Experiment
    this.addChaosExperiment('CPU_STRESS', {
      name: 'CPU Stress Test',
      description: 'Tests system under high CPU load',
      hypothesis: 'System should maintain performance under CPU stress',
      tool: 'LITMUS',
      type: 'resource_chaos',
      parameters: {
        stressor: 'cpu',
        workers: '4',
        load: '80',
        duration: '300s'
      },
      scope: {
        namespaces: ['school-erp-api'],
        pods: ['api-deployment']
      },
      monitoring: {
        metrics: ['cpu_usage', 'response_time', 'throughput'],
        duration: '600s'
      }
    });

 // src/infrastructure/testing/chaos-engineering-manager.js (continued)

    // Memory Pressure Experiment
    this.addChaosExperiment('MEMORY_PRESSURE', {
      name: 'Memory Pressure Test',
      description: 'Tests system under memory pressure',
      hypothesis: 'System should handle memory pressure without crashes',
      tool: 'LITMUS',
      type: 'resource_chaos',
      parameters: {
        stressor: 'memory',
        workers: '2',
        memory: '1GB',
        duration: '300s'
      },
      scope: {
        namespaces: ['school-erp-api'],
        pods: ['api-deployment']
      },
      monitoring: {
        metrics: ['memory_usage', 'oom_kills', 'response_time'],
        duration: '600s'
      }
    });

    // Database Connection Failure Experiment
    this.addChaosExperiment('DATABASE_FAILURE', {
      name: 'Database Connection Failure',
      description: 'Tests system resilience to database failures',
      hypothesis: 'System should gracefully handle database unavailability',
      tool: 'CHAOS_MESH',
      type: 'network_chaos',
      parameters: {
        action: 'netem',
        mode: 'all',
        netem: {
          delay: '100ms',
          loss: '50%',
          duplicate: '10%'
        },
        duration: '180s'
      },
      scope: {
        namespaces: ['school-erp-api'],
        services: ['postgresql-service', 'redis-service']
      },
      monitoring: {
        metrics: ['database_connectivity', 'connection_pool', 'cache_hit_rate'],
        duration: '600s'
      }
    });

    // Disk I/O Chaos Experiment
    this.addChaosExperiment('DISK_IO_CHAOS', {
      name: 'Disk I/O Chaos',
      description: 'Tests system under disk I/O stress',
      hypothesis: 'System should handle disk I/O bottlenecks gracefully',
      tool: 'CHAOS_MESH',
      type: 'io_chaos',
      parameters: {
        action: 'delay',
        mode: 'random-max-percent',
        value: '50',
        delay: '100ms',
        duration: '240s'
      },
      scope: {
        namespaces: ['school-erp-api'],
        volumeMounts: ['/data', '/logs']
      },
      monitoring: {
        metrics: ['disk_io_wait', 'disk_utilization', 'file_operations'],
        duration: '600s'
      }
    });

    // Container Kill Experiment
    this.addChaosExperiment('CONTAINER_KILL', {
      name: 'Random Container Kill',
      description: 'Randomly kills containers to test recovery',
      hypothesis: 'System should automatically recover from container failures',
      tool: 'CUSTOM',
      type: 'container_chaos',
      parameters: {
        killSignal: 'SIGKILL',
        interval: '30s',
        duration: '300s'
      },
      scope: {
        namespaces: ['school-erp-api', 'school-erp-worker'],
        containers: ['api', 'worker', 'scheduler']
      },
      monitoring: {
        metrics: ['container_restarts', 'service_availability', 'recovery_time'],
        duration: '600s'
      }
    });
  }

  /**
   * Setup recovery strategies
   */
  setupRecoveryStrategies() {
    // Auto-scaling recovery
    this.addRecoveryStrategy('AUTO_SCALE', {
      name: 'Automatic Scaling Recovery',
      description: 'Automatically scale resources during chaos',
      triggers: ['high_cpu', 'high_memory', 'pod_failures'],
      actions: {
        scaleUp: {
          cpu: { threshold: 80, action: 'increase_replicas' },
          memory: { threshold: 85, action: 'increase_replicas' },
          pods: { threshold: 50, action: 'increase_replicas' }
        }
      }
    });

    // Circuit breaker recovery
    this.addRecoveryStrategy('CIRCUIT_BREAKER', {
      name: 'Circuit Breaker Recovery',
      description: 'Activate circuit breakers during failures',
      triggers: ['high_error_rate', 'slow_response_time'],
      actions: {
        openCircuit: { errorRate: 50, responseTime: 5000 },
        fallbackResponse: { enabled: true, cacheTTL: '60s' }
      }
    });

    // Graceful degradation recovery
    this.addRecoveryStrategy('GRACEFUL_DEGRADATION', {
      name: 'Graceful Degradation',
      description: 'Disable non-critical features during chaos',
      triggers: ['resource_exhaustion', 'service_unavailable'],
      actions: {
        disableFeatures: ['analytics', 'reporting', 'notifications'],
        enableCaching: { aggressive: true, ttl: '300s' },
        reduceComplexity: { simplifyQueries: true, limitResults: 100 }
      }
    });
  }

  /**
   * Execute chaos experiment
   */
  async executeChaosExperiment(experimentId, options = {}) {
    try {
      logger.info(`Starting chaos experiment: ${experimentId}`);

      const experiment = this.chaosExperiments.get(experimentId);
      if (!experiment) {
        throw new Error(`Chaos experiment not found: ${experimentId}`);
      }

      const experimentSession = {
        sessionId: `chaos_${Date.now()}`,
        experimentId,
        experimentName: experiment.name,
        startTime: new Date(),
        tool: experiment.tool,
        hypothesis: experiment.hypothesis,
        phase: 'PREPARATION',
        results: {
          baseline: {},
          experiment: {},
          recovery: {}
        },
        success: false,
        observations: []
      };

      // Phase 1: Establish baseline
      experimentSession.phase = 'BASELINE';
      logger.info(`Establishing baseline for experiment: ${experimentId}`);
      
      const baselineMetrics = await this.establishBaseline(experiment, options);
      experimentSession.results.baseline = baselineMetrics;

      // Phase 2: Execute chaos
      experimentSession.phase = 'CHAOS_INJECTION';
      logger.info(`Injecting chaos for experiment: ${experimentId}`);

      const chaosTool = this.chaosTools.get(experiment.tool);
      if (!chaosTool) {
        throw new Error(`Chaos tool not found: ${experiment.tool}`);
      }

      const chaosResult = await chaosTool.execute({
        ...experiment,
        ...options,
        sessionId: experimentSession.sessionId
      });

      // Phase 3: Monitor during chaos
      experimentSession.phase = 'MONITORING';
      const monitoringResult = await this.monitorChaosExperiment(experiment, experimentSession);
      experimentSession.results.experiment = monitoringResult;

      // Phase 4: Recovery and cleanup
      experimentSession.phase = 'RECOVERY';
      logger.info(`Cleaning up chaos experiment: ${experimentId}`);
      
      await this.cleanupChaosExperiment(experimentSession, chaosResult);
      
      const recoveryMetrics = await this.measureRecovery(experiment, experimentSession);
      experimentSession.results.recovery = recoveryMetrics;

      // Phase 5: Analysis
      experimentSession.phase = 'ANALYSIS';
      const analysis = await this.analyzeChaosResults(experimentSession);
      experimentSession.analysis = analysis;
      experimentSession.success = analysis.hypothesisProven;

      experimentSession.endTime = new Date();
      experimentSession.duration = experimentSession.endTime - experimentSession.startTime;

      // Store experiment results
      this.experimentResults.set(experimentSession.sessionId, experimentSession);

      // Generate chaos report
      const report = await this.generateChaosReport(experimentSession);

      // Update resilience baselines
      await this.updateResilienceBaselines(experimentSession);

      // Emit experiment completed event
      this.emit('chaosExperimentCompleted', {
        sessionId: experimentSession.sessionId,
        experimentId,
        success: experimentSession.success,
        analysis,
        report
      });

      logger.info(`Chaos experiment completed: ${experimentId}`, {
        sessionId: experimentSession.sessionId,
        duration: experimentSession.duration,
        success: experimentSession.success,
        hypothesisProven: analysis.hypothesisProven
      });

      return experimentSession;

    } catch (error) {
      logger.error(`Chaos experiment failed: ${experimentId}`, error);
      throw error;
    }
  }

  /**
   * Execute Chaos Mesh experiment
   */
  async executeChaoseMeshExperiment(experiment) {
    try {
      const startTime = Date.now();
      
      // Generate Chaos Mesh manifest
      const manifest = this.generateChaosMeshManifest(experiment);
      
      // Save manifest to temporary file
      const manifestPath = path.join('temp', `chaos-manifest-${experiment.sessionId}.yaml`);
      await fs.mkdir(path.dirname(manifestPath), { recursive: true });
      await fs.writeFile(manifestPath, manifest);

      // Apply manifest using kubectl
      const applyCommand = `kubectl apply -f ${manifestPath}`;
      execSync(applyCommand, { encoding: 'utf-8' });

      logger.info(`Chaos Mesh experiment started: ${experiment.sessionId}`);

      // Wait for experiment duration
      await this.sleep(this.parseDuration(experiment.parameters.duration));

      // Delete manifest (cleanup)
      const deleteCommand = `kubectl delete -f ${manifestPath}`;
      execSync(deleteCommand, { encoding: 'utf-8' });

      // Cleanup temporary file
      await fs.unlink(manifestPath);

      return {
        status: 'SUCCESS',
        tool: 'CHAOS_MESH',
        duration: Date.now() - startTime,
        manifestPath: manifestPath,
        chaosType: experiment.type
      };

    } catch (error) {
      logger.error('Chaos Mesh experiment failed:', error);
      throw error;
    }
  }

  /**
   * Execute Gremlin experiment
   */
  async executeGremlinExperiment(experiment) {
    try {
      const startTime = Date.now();
      
      // Prepare Gremlin API request
      const gremlinPayload = {
        target: {
          type: 'Kubernetes',
          namespace: experiment.scope.namespaces[0],
          labels: experiment.scope.labelSelectors
        },
        attack: {
          type: experiment.type,
          parameters: experiment.parameters
        },
        halt: {
          type: 'timer',
          endTime: new Date(Date.now() + this.parseDuration(experiment.parameters.duration))
        }
      };

      // Make API call to Gremlin (simulated)
      logger.info(`Gremlin experiment payload prepared: ${JSON.stringify(gremlinPayload)}`);
      
      // In production, this would make actual API calls to Gremlin
      // const response = await fetch(`${this.chaosTools.get('GREMLIN').api}/attacks`, {
      //   method: 'POST',
      //   headers: {
      //     'Authorization': `Bearer ${process.env.GREMLIN_API_KEY}`,
      //     'Content-Type': 'application/json'
      //   },
      //   body: JSON.stringify(gremlinPayload)
      // });

      // Simulate experiment duration
      await this.sleep(this.parseDuration(experiment.parameters.duration));

      return {
        status: 'SUCCESS',
        tool: 'GREMLIN',
        duration: Date.now() - startTime,
        payload: gremlinPayload
      };

    } catch (error) {
      logger.error('Gremlin experiment failed:', error);
      throw error;
    }
  }

  /**
   * Execute Litmus experiment
   */
  async executeLitmusExperiment(experiment) {
    try {
      const startTime = Date.now();
      
      // Generate Litmus workflow
      const workflow = this.generateLitmusWorkflow(experiment);
      
      // Save workflow to temporary file
      const workflowPath = path.join('temp', `litmus-workflow-${experiment.sessionId}.yaml`);
      await fs.mkdir(path.dirname(workflowPath), { recursive: true });
      await fs.writeFile(workflowPath, workflow);

      // Apply workflow using kubectl
      const applyCommand = `kubectl apply -f ${workflowPath}`;
      execSync(applyCommand, { encoding: 'utf-8' });

      // Monitor workflow completion
      await this.monitorLitmusWorkflow(experiment.sessionId);

      // Cleanup workflow
      const deleteCommand = `kubectl delete -f ${workflowPath}`;
      execSync(deleteCommand, { encoding: 'utf-8' });

      // Cleanup temporary file
      await fs.unlink(workflowPath);

      return {
        status: 'SUCCESS',
        tool: 'LITMUS',
        duration: Date.now() - startTime,
        workflowPath: workflowPath
      };

    } catch (error) {
      logger.error('Litmus experiment failed:', error);
      throw error;
    }
  }

  /**
   * Execute custom chaos script
   */
  async executeCustomChaosScript(experiment) {
    try {
      const startTime = Date.now();
      const scriptContent = this.generateCustomChaosScript(experiment);
      
      // Save script to temporary file
      const scriptPath = path.join('temp', `chaos-script-${experiment.sessionId}.sh`);
      await fs.mkdir(path.dirname(scriptPath), { recursive: true });
      await fs.writeFile(scriptPath, scriptContent, { mode: 0o755 });

      // Execute script
      const output = execSync(`bash ${scriptPath}`, { 
        encoding: 'utf-8',
        timeout: this.parseDuration(experiment.parameters.duration) + 30000 // Extra 30s buffer
      });

      // Cleanup script
      await fs.unlink(scriptPath);

      return {
        status: 'SUCCESS',
        tool: 'CUSTOM',
        duration: Date.now() - startTime,
        output: output,
        scriptPath: scriptPath
      };

    } catch (error) {
      logger.error('Custom chaos script failed:', error);
      throw error;
    }
  }

  /**
   * Generate Chaos Mesh manifest
   */
  generateChaosMeshManifest(experiment) {
    switch (experiment.type) {
      case 'pod_chaos':
        return this.generatePodChaosManifest(experiment);
      case 'network_chaos':
        return this.generateNetworkChaosManifest(experiment);
      case 'io_chaos':
        return this.generateIOChaosManifest(experiment);
      default:
        throw new Error(`Unsupported Chaos Mesh experiment type: ${experiment.type}`);
    }
  }

  /**
   * Generate Pod Chaos manifest
   */
  generatePodChaosManifest(experiment) {
    return `
apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: ${experiment.sessionId}
  namespace: ${experiment.scope.namespaces[0]}
spec:
  action: ${experiment.parameters.action}
  mode: ${experiment.parameters.mode}
  value: "${experiment.parameters.value}"
  duration: ${experiment.parameters.duration}
  selector:
    namespaces:
${experiment.scope.namespaces.map(ns => `      - ${ns}`).join('\n')}
    labelSelectors:
${experiment.scope.labelSelectors.map(label => `      ${label.split('=')[0]}: ${label.split('=')[1]}`).join('\n')}
`;
  }

  /**
   * Generate Network Chaos manifest
   */
  generateNetworkChaosManifest(experiment) {
    return `
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: ${experiment.sessionId}
  namespace: ${experiment.scope.namespaces[0]}
spec:
  action: ${experiment.parameters.action}
  mode: ${experiment.parameters.mode}
  value: "${experiment.parameters.value}"
  duration: ${experiment.parameters.duration}
  direction: ${experiment.parameters.direction}
  selector:
    namespaces:
${experiment.scope.namespaces.map(ns => `      - ${ns}`).join('\n')}
    labelSelectors:
${experiment.scope.labelSelectors.map(label => `      ${label.split('=')[0]}: ${label.split('=')[1]}`).join('\n')}
`;
  }

  /**
   * Generate IO Chaos manifest
   */
  generateIOChaosManifest(experiment) {
    return `
apiVersion: chaos-mesh.org/v1alpha1
kind: IOChaos
metadata:
  name: ${experiment.sessionId}
  namespace: ${experiment.scope.namespaces[0]}
spec:
  action: ${experiment.parameters.action}
  mode: ${experiment.parameters.mode}
  value: "${experiment.parameters.value}"
  duration: ${experiment.parameters.duration}
  delay: ${experiment.parameters.delay}
  volumePath: ${experiment.scope.volumeMounts[0]}
  selector:
    namespaces:
${experiment.scope.namespaces.map(ns => `      - ${ns}`).join('\n')}
    labelSelectors:
${experiment.scope.labelSelectors.map(label => `      ${label.split('=')[0]}: ${label.split('=')[1]}`).join('\n')}
`;
  }

  /**
   * Generate Litmus workflow
   */
  generateLitmusWorkflow(experiment) {
    return `
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: ${experiment.sessionId}
  namespace: litmus
spec:
  entrypoint: chaos-experiment
  serviceAccountName: argo-chaos
  templates:
  - name: chaos-experiment
    steps:
    - - name: install-experiment
        template: install-chaos-experiment
    - - name: run-experiment
        template: run-chaos-experiment
    - - name: cleanup-experiment
        template: cleanup-chaos-experiment
  - name: install-chaos-experiment
    container:
      image: litmuschaos/ansible-runner:latest
      command: [sh, -c]
      args: ["kubectl apply -f /tmp/chaosengine.yaml"]
  - name: run-chaos-experiment
    container:
      image: litmuschaos/ansible-runner:latest
      command: [sh, -c]
      args: ["sleep ${this.parseDuration(experiment.parameters.duration) / 1000}"]
  - name: cleanup-chaos-experiment
    container:
      image: litmuschaos/ansible-runner:latest
      command: [sh, -c]
      args: ["kubectl delete chaosengine ${experiment.sessionId}"]
`;
  }

  /**
   * Generate custom chaos script
   */
  generateCustomChaosScript(experiment) {
    switch (experiment.type) {
      case 'container_chaos':
        return this.generateContainerKillScript(experiment);
      default:
        return `
#!/bin/bash
echo "Starting custom chaos experiment: ${experiment.sessionId}"
echo "Duration: ${experiment.parameters.duration}"
sleep ${this.parseDuration(experiment.parameters.duration) / 1000}
echo "Custom chaos experiment completed"
`;
    }
  }

  /**
   * Generate container kill script
   */
  generateContainerKillScript(experiment) {
    return `
#!/bin/bash
echo "Starting container kill chaos experiment"

DURATION=${this.parseDuration(experiment.parameters.duration) / 1000}
INTERVAL=${this.parseDuration(experiment.parameters.interval) / 1000}
NAMESPACES="${experiment.scope.namespaces.join(' ')}"
CONTAINERS="${experiment.scope.containers.join(' ')}"

END_TIME=$(($(date +%s) + DURATION))

while [ $(date +%s) -lt $END_TIME ]; do
  for NAMESPACE in $NAMESPACES; do
    # Get random pod from namespace
    POD=$(kubectl get pods -n $NAMESPACE -o jsonpath='{.items[*].metadata.name}' | tr ' ' '\n' | shuf -n 1)
    
    if [ ! -z "$POD" ]; then
      echo "Killing pod: $POD in namespace: $NAMESPACE"
      kubectl delete pod $POD -n $NAMESPACE --force --grace-period=0
    fi
  done
  
  sleep $INTERVAL
done

echo "Container kill chaos experiment completed"
`;
  }

  /**
   * Establish baseline metrics
   */
  async establishBaseline(experiment, options) {
    logger.info(`Establishing baseline for experiment: ${experiment.name}`);
    
    const baselineDuration = experiment.monitoring.baseline_window || '300s';
    const baselineMetrics = {};

    // Collect baseline metrics for specified duration
    const startTime = Date.now();
    const endTime = startTime + this.parseDuration(baselineDuration);

    while (Date.now() < endTime) {
      for (const metric of experiment.monitoring.metrics) {
        const value = await this.collectMetric(metric, experiment.scope);
        
        if (!baselineMetrics[metric]) {
          baselineMetrics[metric] = [];
        }
        
        baselineMetrics[metric].push({
          timestamp: new Date(),
          value: value
        });
      }
      
      await this.sleep(5000); // Collect every 5 seconds
    }

    // Calculate baseline statistics
    const baselineStats = {};
    for (const [metric, values] of Object.entries(baselineMetrics)) {
      const numericValues = values.map(v => v.value).filter(v => typeof v === 'number');
      
      baselineStats[metric] = {
        count: numericValues.length,
        avg: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
        min: Math.min(...numericValues),
        max: Math.max(...numericValues),
        p50: this.percentile(numericValues, 50),
        p95: this.percentile(numericValues, 95),
        p99: this.percentile(numericValues, 99)
      };
    }

    logger.info(`Baseline established for ${Object.keys(baselineStats).length} metrics`);
    return baselineStats;
  }

  /**
   * Monitor chaos experiment
   */
  async monitorChaosExperiment(experiment, experimentSession) {
    logger.info(`Monitoring chaos experiment: ${experimentSession.sessionId}`);
    
    const monitoringDuration = this.parseDuration(experiment.monitoring.duration);
    const monitoringMetrics = {};
    
    const startTime = Date.now();
    const endTime = startTime + monitoringDuration;

    while (Date.now() < endTime) {
      for (const metric of experiment.monitoring.metrics) {
        const value = await this.collectMetric(metric, experiment.scope);
        
        if (!monitoringMetrics[metric]) {
          monitoringMetrics[metric] = [];
        }
        
        monitoringMetrics[metric].push({
          timestamp: new Date(),
          value: value
        });
      }
      
      // Record observations
      const observation = await this.recordObservation(experiment, experimentSession);
      if (observation) {
        experimentSession.observations.push(observation);
      }
      
      await this.sleep(5000); // Monitor every 5 seconds
    }

    // Calculate monitoring statistics
    const monitoringStats = {};
    for (const [metric, values] of Object.entries(monitoringMetrics)) {
      const numericValues = values.map(v => v.value).filter(v => typeof v === 'number');
      
      monitoringStats[metric] = {
        count: numericValues.length,
        avg: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
        min: Math.min(...numericValues),
        max: Math.max(...numericValues),
        p50: this.percentile(numericValues, 50),
        p95: this.percentile(numericValues, 95),
        p99: this.percentile(numericValues, 99)
      };
    }

    logger.info(`Monitoring completed with ${experimentSession.observations.length} observations`);
    return monitoringStats;
  }

  /**
   * Cleanup chaos experiment
   */
  async cleanupChaosExperiment(experimentSession, chaosResult) {
    logger.info(`Cleaning up chaos experiment: ${experimentSession.sessionId}`);
    
    try {
      // Tool-specific cleanup
      switch (experimentSession.tool) {
        case 'CHAOS_MESH':
          // Chaos Mesh automatically cleans up after duration
          break;
        case 'GREMLIN':
          // Gremlin automatically stops after halt condition
          break;
        case 'LITMUS':
          // Litmus workflow includes cleanup steps
          break;
        case 'CUSTOM':
          // Custom scripts handle their own cleanup
          break;
      }

      // Wait for system stabilization
      await this.sleep(30000); // Wait 30 seconds for recovery

      logger.info(`Cleanup completed for experiment: ${experimentSession.sessionId}`);

    } catch (error) {
      logger.error(`Cleanup failed for experiment: ${experimentSession.sessionId}`, error);
    }
  }

  /**
   * Measure recovery metrics
   */
  async measureRecovery(experiment, experimentSession) {
    logger.info(`Measuring recovery for experiment: ${experimentSession.sessionId}`);
    
    const recoveryWindow = 60000; // 1 minute recovery window
    const recoveryMetrics = {};
    
    const startTime = Date.now();
    const endTime = startTime + recoveryWindow;

    while (Date.now() < endTime) {
      for (const metric of experiment.monitoring.metrics) {
        const value = await this.collectMetric(metric, experiment.scope);
        
        if (!recoveryMetrics[metric]) {
          recoveryMetrics[metric] = [];
        }
        
        recoveryMetrics[metric].push({
          timestamp: new Date(),
          value: value
        });
      }
      
      await this.sleep(5000);
    }

    // Calculate recovery statistics
    const recoveryStats = {};
    for (const [metric, values] of Object.entries(recoveryMetrics)) {
      const numericValues = values.map(v => v.value).filter(v => typeof v === 'number');
      
      recoveryStats[metric] = {
        count: numericValues.length,
        avg: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
        finalValue: numericValues[numericValues.length - 1],
        recovered: this.checkRecovery(metric, numericValues, experimentSession.results.baseline[metric])
      };
    }

    logger.info(`Recovery measurement completed`);
    return recoveryStats;
  }

  /**
   * Analyze chaos experiment results
   */
  async analyzeChaosResults(experimentSession) {
    logger.info(`Analyzing results for experiment: ${experimentSession.sessionId}`);
    
    const analysis = {
      hypothesisProven: false,
      confidenceLevel: 0,
      insights: [],
      anomalies: [],
      improvements: [],
      steadyStateVerified: false
    };

    const { baseline, experiment, recovery } = experimentSession.results;

    // Compare baseline vs experiment metrics
    for (const metric of Object.keys(baseline)) {
      if (experiment[metric] && recovery[metric]) {
        const baselineAvg = baseline[metric].avg;
        const experimentAvg = experiment[metric].avg;
        const recoveryAvg = recovery[metric].avg;

        // Check for significant deviations
        const experimentDeviation = Math.abs((experimentAvg - baselineAvg) / baselineAvg) * 100;
        const recoveryDeviation = Math.abs((recoveryAvg - baselineAvg) / baselineAvg) * 100;

        if (experimentDeviation > 20) {
          analysis.anomalies.push({
            metric,
            type: 'SIGNIFICANT_DEVIATION',
            baselineValue: baselineAvg,
            experimentValue: experimentAvg,
            deviation: experimentDeviation,
            description: `${metric} deviated by ${experimentDeviation.toFixed(1)}% during chaos`
          });
        }

        if (recoveryDeviation < 10) {
          analysis.insights.push({
            metric,
            type: 'GOOD_RECOVERY',
            description: `${metric} recovered to within 10% of baseline`,
            recoveryTime: 'within 60 seconds'
          });
        } else {
          analysis.improvements.push({
            metric,
            type: 'SLOW_RECOVERY',
            description: `${metric} did not fully recover to baseline levels`,
            suggestion: 'Consider implementing faster recovery mechanisms'
          });
        }
      }
    }

    // Determine if hypothesis was proven
    const criticalAnomalies = analysis.anomalies.filter(a => a.deviation > 50).length;
    const slowRecoveries = analysis.improvements.filter(i => i.type === 'SLOW_RECOVERY').length;
    
    analysis.hypothesisProven = criticalAnomalies === 0 && slowRecoveries < 2;
    analysis.confidenceLevel = Math.max(0, 100 - (criticalAnomalies * 30) - (slowRecoveries * 10));
    analysis.steadyStateVerified = analysis.hypothesisProven && analysis.confidenceLevel > 70;

    logger.info(`Analysis completed: hypothesis proven = ${analysis.hypothesisProven}`);
    return analysis;
  }

  /**
   * Generate chaos experiment report
   */
  async generateChaosReport(experimentSession) {
    const report = {
      sessionId: experimentSession.sessionId,
      generatedAt: new Date(),
      experiment: {
        id: experimentSession.experimentId,
        name: experimentSession.experimentName,
        hypothesis: experimentSession.hypothesis,
        tool: experimentSession.tool
      },
      duration: experimentSession.duration,
      results: experimentSession.results,
      analysis: experimentSession.analysis,
      observations: experimentSession.observations,
      recommendations: this.generateChaosRecommendations(experimentSession)
    };

    // Save report
    const reportPath = path.join('reports', 'chaos', `chaos-report-${experimentSession.sessionId}.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    return report;
  }

  /**
   * Generate chaos recommendations
   */
  generateChaosRecommendations(experimentSession) {
    const recommendations = [];
    const analysis = experimentSession.analysis;

    if (!analysis.hypothesisProven) {
      recommendations.push({
        type: 'HYPOTHESIS_FAILED',
        priority: 'HIGH',
        message: 'System did not behave as expected during chaos',
        action: 'Review system architecture and implement additional resilience measures'
      });
    }

    if (analysis.anomalies.length > 0) {
      recommendations.push({
        type: 'SIGNIFICANT_ANOMALIES',
        priority: 'MEDIUM',
        message: `${analysis.anomalies.length} significant anomalies detected`,
        action: 'Investigate and address performance degradations during failures'
      });
    }

    if (analysis.improvements.length > 0) {
      recommendations.push({
        type: 'RECOVERY_IMPROVEMENTS',
        priority: 'MEDIUM',
        message: `${analysis.improvements.length} areas need recovery improvements`,
        action: 'Implement faster recovery mechanisms and monitoring'
      });
    }

    if (analysis.steadyStateVerified) {
      recommendations.push({
        type: 'SYSTEM_RESILIENT',
        priority: 'INFO',
        message: 'System demonstrated good resilience under chaos conditions',
        action: 'Continue regular chaos testing to maintain resilience'
      });
    }

    return recommendations;
  }

  // Helper methods
  addChaosTool(toolId, tool) {
    this.chaosTools.set(toolId, tool);
    logger.debug(`Chaos tool added: ${toolId}`);
  }

  addChaosExperiment(experimentId, experiment) {
    this.chaosExperiments.set(experimentId, experiment);
    logger.debug(`Chaos experiment added: ${experimentId}`);
  }

  addRecoveryStrategy(strategyId, strategy) {
    this.recoveryStrategies.set(strategyId, strategy);
    logger.debug(`Recovery strategy added: ${strategyId}`);
  }

  parseDuration(duration) {
    const match = duration.match(/^(\d+)([smh])$/);
    if (!match) return 300000; // Default 5 minutes
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      default: return 300000;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  percentile(values, p) {
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  async collectMetric(metric, scope) {
    // Simulate metric collection
    // In production, this would integrate with monitoring systems
    switch (metric) {
      case 'availability':
        return Math.random() > 0.1 ? 100 : 0; // 90% availability
      case 'response_time':
        return Math.random() * 500 + 100; // 100-600ms
      case 'error_rate':
        return Math.random() * 5; // 0-5% error rate
      case 'cpu_usage':
        return Math.random() * 100; // 0-100% CPU
      case 'memory_usage':
        return Math.random() * 100; // 0-100% memory
      default:
        return Math.random() * 100;
    }
  }

  async recordObservation(experiment, experimentSession) {
    // Record system behavior observations during chaos
    const observation = {
      timestamp: new Date(),
      phase: experimentSession.phase,
      description: `System behavior during ${experiment.name}`,
      metrics: {},
      notes: []
    };

    // Collect current metric values
    for (const metric of experiment.monitoring.metrics) {
      observation.metrics[metric] = await this.collectMetric(metric, experiment.scope);
    }

    return observation;
  }

  checkRecovery(metric, recoveryValues, baselineStats) {
    const recoveryAvg = recoveryValues.reduce((a, b) => a + b, 0) / recoveryValues.length;
    const baselineAvg = baselineStats.avg;
    const deviation = Math.abs((recoveryAvg - baselineAvg) / baselineAvg) * 100;
    
    return deviation < 10; // Consider recovered if within 10% of baseline
  }

  async updateResilienceBaselines(experimentSession) {
    const baselineKey = `${experimentSession.experimentId}_baseline`;
    this.resilenceBaselines.set(baselineKey, {
      experimentId: experimentSession.experimentId,
      timestamp: experimentSession.startTime,
      baseline: experimentSession.results.baseline,
      lastRun: experimentSession.sessionId
    });
  }

  async monitorLitmusWorkflow(sessionId) {
    // Monitor Litmus workflow completion
    // In production, this would check workflow status via kubectl
    await this.sleep(30000); // Simulate monitoring time
  }

  // Public API methods
  getExperimentResults(sessionId) {
    return this.experimentResults.get(sessionId);
  }

  getAvailableExperiments() {
    return Array.from(this.chaosExperiments.keys());
  }

  getChaosTools() {
    return Array.from(this.chaosTools.keys());
  }

  getRecoveryStrategies() {
    return Array.from(this.recoveryStrategies.keys());
  }

  async listChaosReports(limit = 10) {
    const reportsDir = path.join('reports', 'chaos');
    try {
      const files = await fs.readdir(reportsDir);
      const reportFiles = files
        .filter(file => file.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit);

      const reports = [];
      for (const file of reportFiles) {
        const reportPath = path.join(reportsDir, file);
        const reportContent = await fs.readFile(reportPath, 'utf-8');
        reports.push(JSON.parse(reportContent));
      }

      return reports;
    } catch (error) {
      logger.error('Failed to list chaos reports:', error);
      return [];
    }
  }

  async scheduleChaosExperiment(experimentId, schedule, options = {}) {
    // Schedule chaos experiments for regular execution
    // This would integrate with cron or Kubernetes CronJob
    logger.info(`Scheduling chaos experiment: ${experimentId} with schedule: ${schedule}`);
    
    return {
      experimentId,
      schedule,
      options,
      scheduledAt: new Date(),
      status: 'SCHEDULED'
    };
  }

  getChaosStatistics() {
    const experiments = Array.from(this.experimentResults.values());
    
    return {
      totalExperiments: experiments.length,
      successfulExperiments: experiments.filter(e => e.success).length,
      hypothesesProven: experiments.filter(e => e.analysis?.hypothesisProven).length,
      averageConfidence: experiments.reduce((sum, e) => sum + (e.analysis?.confidenceLevel || 0), 0) / experiments.length,
      mostTestedExperiment: this.getMostTestedExperiment(),
      resilienceScore: this.calculateResilienceScore(experiments)
    };
  }

  getMostTestedExperiment() {
    const experimentCounts = {};
    
    for (const result of this.experimentResults.values()) {
      experimentCounts[result.experimentId] = (experimentCounts[result.experimentId] || 0) + 1;
    }

    return Object.entries(experimentCounts)
      .reduce((max, [expId, count]) => count > max.count ? { experimentId: expId, count } : max, { count: 0 });
  }

  calculateResilienceScore(experiments) {
    if (experiments.length === 0) return 0;
    
    const successRate = experiments.filter(e => e.success).length / experiments.length;
    const avgConfidence = experiments.reduce((sum, e) => sum + (e.analysis?.confidenceLevel || 0), 0) / experiments.length;
    
    return Math.round((successRate * 50) + (avgConfidence * 0.5));
  }
}

// Export singleton instance
export const chaosEngineeringManager = new ChaosEngineeringManager();

