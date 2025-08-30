#!/bin/bash
# Automated backup scheduler for Terraform state

# Cron job setup script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/../config/infrastructure/terraform/backup-state.sh"

# Create cron job for daily backups
(crontab -l 2>/dev/null; echo "0 2 * * * $BACKUP_SCRIPT production --multi-region") | crontab -

# Create cron job for weekly cleanup
(crontab -l 2>/dev/null; echo "0 3 * * 0 $BACKUP_SCRIPT production --cleanup-only") | crontab -

echo "✅ Backup scheduler configured successfully"
echo "📋 Current cron jobs:"
crontab -l
