#!/bin/bash
# Complete Monitoring & Observability Stack Setup for School ERP SaaS

set -euo pipefail

# Configuration
NAMESPACE="monitoring"
KUBECTL_TIMEOUT="300s"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        INFO) echo -e "${GREEN}[INFO]${NC} ${timestamp} - ${message}" ;;
        WARN) echo -e "${YELLOW}[WARN]${NC} ${timestamp} - ${message}" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} ${timestamp} - ${message}" ;;
        DEBUG) echo -e "${BLUE}[DEBUG]${NC} ${timestamp} - ${message}" ;;
    esac
}

check_prerequisites() {
    log INFO "Checking prerequisites..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log ERROR "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check cluster connectivity
    if ! kubectl cluster-info &> /dev/null; then
        log ERROR "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    # Check if namespace exists
    if ! kubectl get namespace $NAMESPACE &> /dev/null; then
        log INFO "Creating monitoring namespace..."
        kubectl create namespace $NAMESPACE
    fi
    
    log INFO "Prerequisites check passed"
}

deploy_jaeger() {
    log INFO "Deploying Jaeger distributed tracing..."
    
    kubectl apply -f monitoring/jaeger/ --timeout=$KUBECTL_TIMEOUT
    
    # Wait for Jaeger to be ready
    kubectl wait --for=condition=available --timeout=$KUBECTL_TIMEOUT deployment/jaeger -n $NAMESPACE
    
    log INFO "Jaeger deployed successfully"
}

deploy_elasticsearch() {
    log INFO "Deploying Elasticsearch..."
    
    kubectl apply -f monitoring/elasticsearch/ --timeout=$KUBECTL_TIMEOUT
    
    # Wait for Elasticsearch StatefulSet to be ready
    kubectl wait --for=condition=ready --timeout=$KUBECTL_TIMEOUT pod -l app=elasticsearch -n $NAMESPACE
    
    log INFO "Elasticsearch deployed successfully"
}

deploy_fluentd() {
    log INFO "Deploying Fluentd log aggregation..."
    
    # Create TLS secret for Fluentd (self-signed for demo)
    if ! kubectl get secret fluentd-tls -n $NAMESPACE &> /dev/null; then
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout /tmp/fluentd.key -out /tmp/fluentd.crt \
            -subj "/CN=fluentd.monitoring.svc.cluster.local"
        
        kubectl create secret tls fluentd-tls \
            --cert=/tmp/fluentd.crt --key=/tmp/fluentd.key -n $NAMESPACE
        
        rm -f /tmp/fluentd.key /tmp/fluentd.crt
    fi
    
    kubectl apply -f monitoring/fluentd/ --timeout=$KUBECTL_TIMEOUT
    
    # Wait for Fluentd DaemonSet to be ready
    kubectl rollout status daemonset/fluentd -n $NAMESPACE --timeout=$KUBECTL_TIMEOUT
    
    log INFO "Fluentd deployed successfully"
}

deploy_kibana() {
    log INFO "Deploying Kibana visualization..."
    
    kubectl apply -f monitoring/kibana/ --timeout=$KUBECTL_TIMEOUT
    
    # Wait for Kibana to be ready
    kubectl wait --for=condition=available --timeout=$KUBECTL_TIMEOUT deployment/kibana -n $NAMESPACE
    
    log INFO "Kibana deployed successfully"
}

verify_deployment() {
    log INFO "Verifying deployment..."
    
    # Check all pods are running
    local failed_pods
    failed_pods=$(kubectl get pods -n $NAMESPACE --field-selector=status.phase!=Running --no-headers 2>/dev/null | wc -l)
    
    if [ "$failed_pods" -gt 0 ]; then
        log WARN "Some pods are not running:"
        kubectl get pods -n $NAMESPACE --field-selector=status.phase!=Running
    fi
    
    # Test connectivity
    log INFO "Testing service connectivity..."
    
    # Port-forward to test services
    kubectl port-forward -n $NAMESPACE svc/jaeger-query 16686:80 &
    JAEGER_PID=$!
    sleep 5
    
    if curl -s http://localhost:16686 > /dev/null; then
        log INFO "Jaeger is accessible"
    else
        log WARN "Jaeger connectivity test failed"
    fi
    kill $JAEGER_PID 2>/dev/null || true
    
    kubectl port-forward -n $NAMESPACE svc/kibana 5601:5601 &
    KIBANA_PID=$!
    sleep 5
    
    if curl -s http://localhost:5601/kibana > /dev/null; then
        log INFO "Kibana is accessible"
    else
        log WARN "Kibana connectivity test failed"
    fi
    kill $KIBANA_PID 2>/dev/null || true
    
    log INFO "Deployment verification completed"
}

setup_monitoring_integration() {
    log INFO "Setting up monitoring integration with existing Prometheus..."
    
    # Add ServiceMonitors for Prometheus to scrape
    cat <<EOF | kubectl apply -f -
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: jaeger
  namespace: monitoring
  labels:
    app: jaeger
spec:
  selector:
    matchLabels:
      app: jaeger
  endpoints:
  - port: query
    path: /metrics
    interval: 30s
---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: elasticsearch
  namespace: monitoring
  labels:
    app: elasticsearch
spec:
  selector:
    matchLabels:
      app: elasticsearch
  endpoints:
  - port: rest
    path: /_prometheus/metrics
    interval: 30s
EOF
    
    log INFO "Prometheus ServiceMonitors configured"
}

print_access_info() {
    log INFO "Observability stack deployed successfully!"
    echo ""
    echo "Access Information:"
    echo "=================="
    echo ""
    echo "📊 Jaeger (Distributed Tracing):"
    echo "   kubectl port-forward -n monitoring svc/jaeger-query 16686:80"
    echo "   Then visit: http://localhost:16686"
    echo ""
    echo "🔍 Kibana (Log Visualization):"
    echo "   kubectl port-forward -n monitoring svc/kibana 5601:5601"
    echo "   Then visit: http://localhost:5601/kibana"
    echo ""
    echo "🔧 Elasticsearch (Direct API):"
    echo "   kubectl port-forward -n monitoring svc/elasticsearch-lb 9200:9200"
    echo "   Then access: http://localhost:9200"
    echo ""
    echo "📝 View Logs:"
    echo "   kubectl logs -n monitoring -l app=fluentd"
    echo ""
    echo "✅ Integration with existing Prometheus/Grafana is configured"
    echo "   ServiceMonitors have been created for metric collection"
}

main() {
    log INFO "Starting School ERP SaaS Observability Stack deployment..."
    
    check_prerequisites
    deploy_elasticsearch
    sleep 30  # Allow Elasticsearch to stabilize
    deploy_fluentd
    deploy_jaeger
    deploy_kibana
    verify_deployment
    setup_monitoring_integration
    
    print_access_info
    
    log INFO "Observability stack deployment completed!"
}

# Execute main function
main "$@"
