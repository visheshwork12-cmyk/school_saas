#!/bin/bash
# Setup comprehensive alerting for School ERP SaaS

set -euo pipefail

NAMESPACE="monitoring"
KUBECTL_TIMEOUT="300s"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Setting up School ERP SaaS alerting rules..."

# Deploy Prometheus rules
kubectl apply -f monitoring/prometheus/alert-rules/ -n $NAMESPACE

# Deploy AlertManager configuration
kubectl create secret generic alertmanager-config \
  --from-file=alertmanager.yml=monitoring/alertmanager/alertmanager.yml \
  -n $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Create email password secret
if [[ -n "${SMTP_PASSWORD:-}" ]]; then
    kubectl create secret generic alertmanager-email \
      --from-literal=password="$SMTP_PASSWORD" \
      -n $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
fi

# Create Slack webhook secret
if [[ -n "${SLACK_API_URL:-}" ]]; then
    kubectl create secret generic alertmanager-slack \
      --from-literal=api_url="$SLACK_API_URL" \
      -n $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
fi

# Restart AlertManager to pick up new config
kubectl rollout restart deployment/alertmanager -n $NAMESPACE
kubectl rollout status deployment/alertmanager -n $NAMESPACE --timeout=$KUBECTL_TIMEOUT

# Restart Prometheus to pick up new rules
kubectl rollout restart deployment/prometheus -n $NAMESPACE
kubectl rollout status deployment/prometheus -n $NAMESPACE --timeout=$KUBECTL_TIMEOUT

log "Testing alert configurations..."

# Verify Prometheus rules are loaded
kubectl exec -n $NAMESPACE deployment/prometheus -- \
  wget -qO- http://localhost:9090/api/v1/rules | jq '.data.groups[] | select(.name == "school-erp.rules")'

log "Alerting setup completed successfully!"
echo ""
echo "Alert endpoints:"
echo "  Prometheus: kubectl port-forward -n monitoring svc/prometheus 9090:9090"
echo "  AlertManager: kubectl port-forward -n monitoring svc/alertmanager 9093:9093"
echo ""
echo "Test an alert:"
echo "  kubectl exec -n monitoring deployment/prometheus -- \\"
echo "    wget -qO- --post-data='' http://localhost:9090/api/v1/admin/tsdb/delete_series?match[]={__name__=~\".*\"}"
