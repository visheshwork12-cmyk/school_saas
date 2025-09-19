#!/bin/bash
# scripts/security/validate-rbac.sh
set -euo pipefail

NAMESPACE="school-erp"
SERVICE_ACCOUNT="school-erp-service-account"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] RBAC-VALIDATE: $*"
}

validate_rbac() {
    log "🔒 Validating RBAC configuration..."
    
    # Test service account exists
    if kubectl get serviceaccount $SERVICE_ACCOUNT -n $NAMESPACE &>/dev/null; then
        log "✅ Service account exists: $SERVICE_ACCOUNT"
    else
        log "❌ Service account not found: $SERVICE_ACCOUNT"
        exit 1
    fi
    
    # Test permissions
    local permissions=(
        "pods:get"
        "pods:list"
        "services:get"
        "configmaps:get"
        "secrets:get"
        "deployments:get"
    )
    
    log "🔍 Testing permissions..."
    for perm in "${permissions[@]}"; do
        local resource=$(echo $perm | cut -d: -f1)
        local verb=$(echo $perm | cut -d: -f2)
        
        if kubectl auth can-i $verb $resource \
           --as=system:serviceaccount:$NAMESPACE:$SERVICE_ACCOUNT \
           -n $NAMESPACE &>/dev/null; then
            log "✅ Permission granted: $verb $resource"
        else
            log "❌ Permission denied: $verb $resource"
        fi
    done
    
    # Test forbidden permissions
    local forbidden=(
        "pods:delete"
        "secrets:create"
        "deployments:delete"
        "nodes:delete"
    )
    
    log "🚫 Testing forbidden permissions..."
    for perm in "${forbidden[@]}"; do
        local resource=$(echo $perm | cut -d: -f1)
        local verb=$(echo $perm | cut -d: -f2)
        
        if ! kubectl auth can-i $verb $resource \
           --as=system:serviceaccount:$NAMESPACE:$SERVICE_ACCOUNT \
           -n $NAMESPACE &>/dev/null; then
            log "✅ Permission correctly denied: $verb $resource"
        else
            log "⚠️ Permission incorrectly granted: $verb $resource"
        fi
    done
    
    log "✅ RBAC validation completed"
}

validate_rbac
