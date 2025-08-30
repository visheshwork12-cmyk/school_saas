// scripts/restore/mongodb-restore.js
import { exec } from 'child_process';
import { logger } from '#utils/core/logger.js';
import config from '#config/index.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';

/**
 * @description Restores MongoDB from backup
 * @param {string} tenantId - Tenant identifier
 * @param {string} backupPath - Path to backup directory
 * @returns {Promise<void>}
 */
async function restoreMongoDB(tenantId, backupPath) {
  try {
    const uri = config.mongodbUri;
    const command = `mongorestore --uri="${uri}" --dir="${backupPath}"`;
    await new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });

    logger.info(`MongoDB restored for tenant ${tenantId}`, { backupPath });
    await AuditService.log('RESTORE_MONGODB', { tenantId, backupPath });
  } catch (error) {
    logger.error(`MongoDB restore failed: ${error.message}`, { error });
    await AuditService.log('RESTORE_MONGODB_FAILED', { tenantId, error });
    throw error;
  }
}

export { restoreMongoDB };