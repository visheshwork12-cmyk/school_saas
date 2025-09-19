#!/bin/bash
# scripts/security/test-network-policies.sh
set -euo pipefail

NAMESPACE="school-erp"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] NETPOL-TEST: $*"
}

test_network_policies() {
    log "🔒 Testing network policies..."
    
    # Deploy test pods
    kubectl run netpol-test-client \
        --image=busybox:1.35 \
        --rm -it --restart=Never \
        -n $NAMESPACE \
        -- sleep 3600 &
    
    sleep 10
    
    # Test allowed connections
    log "✅ Testing allowed connections..."
    
    # Test connection to app service (should work)
    if kubectl exec netpol-test-client -n $NAMESPACE -- \
       nc -z school-erp-service 3000; then
        log "✅ Connection to app service: ALLOWED (correct)"
    else
        log "❌ Connection to app service: DENIED (incorrect)"
    fi
    
    # Test DNS resolution (should work)
    if kubectl exec netpol-test-client -n $NAMESPACE -- \
       nslookup kubernetes.default.svc.cluster.local; then
        log "✅ DNS resolution: ALLOWED (correct)"
    else
        log "❌ DNS resolution: DENIED (incorrect)"
    fi
    
    # Clean up test pod
    kubectl delete pod netpol-test-client -n $NAMESPACE --ignore-not-found
    
    log "✅ Network policy testing completed"
}

# Apply network policies first
kubectl apply -f k8s/security/network-policies.yaml

# Wait for policies to be active
sleep 30

# Run tests
test_network_policies
