// scripts/doc-lifecycle.js
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '#utils/core/logger.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import { BusinessException } from '#shared/exceptions/business.exception.js';
import { config } from '#config/index.js';

const execAsync = promisify(exec);

/**
 * @typedef {Object} Change
 * @property {string} file - File path
 * @property {Date} lastModified - Last modified timestamp
 * @property {string} type - Change type (schema | api)
 */

/**
 * @typedef {Object} SyncAnalysis
 * @property {Date} lastCodeUpdate - Last code update timestamp
 * @property {Date} lastDocUpdate - Last documentation update timestamp
 * @property {boolean} outOfSync - Whether documentation is out of sync
 * @property {string[]} affectedAreas - Areas needing documentation updates
 */

/**
 * @description Manages documentation lifecycle and sync status
 */
export class DocumentationLifecycle {
  /**
   * @description Checks if documentation is in sync with code
   * @returns {Promise<SyncAnalysis>} Sync analysis
   */
  async checkSyncStatus() {
    try {
      const codeChanges = await this.getRecentCodeChanges();
      const docChanges = await this.getRecentDocChanges();

      const analysis = {
        lastCodeUpdate: codeChanges.lastUpdate,
        lastDocUpdate: docChanges.lastUpdate,
        outOfSync: this.isOutOfSync(codeChanges, docChanges),
        affectedAreas: this.getAffectedAreas(codeChanges),
      };

      await AuditService.log('DOC_SYNC_CHECK', {
        action: 'check_sync_status',
        outOfSync: analysis.outOfSync,
        affectedAreas: analysis.affectedAreas,
      });

      return analysis;
    } catch (error) {
      logger.error(`Sync status check failed: ${error.message}`);
      throw new BusinessException('Sync status check failed', 'SYNC_CHECK_FAILED', 500);
    }
  }

  /**
   * @description Gets recent code changes
   * @returns {Promise<{lastUpdate: Date, changes: Change[]}>}
   */
  async getRecentCodeChanges() {
    try {
      const { stdout: modelFiles } = await execAsync('find src/domain/models -name "*.js" -type f');
      const { stdout: apiFiles } = await execAsync('find src/api -name "*.js" -type f');

      const files = [...modelFiles.split('\n'), ...apiFiles.split('\n')].filter(Boolean);
      const changes = [];

      for (const file of files) {
        const stat = await fs.stat(file);
        changes.push({
          file,
          lastModified: stat.mtime,
          type: file.includes('models') ? 'schema' : 'api',
        });
      }

      return {
        lastUpdate: new Date(Math.max(...changes.map((c) => c.lastModified))),
        changes: changes.filter(
          (c) => Date.now() - c.lastModified.getTime() < 7 * 24 * 60 * 60 * 1000 // Last 7 days
        ),
      };
    } catch (error) {
      logger.error(`Failed to get code changes: ${error.message}`);
      throw error;
    }
  }

  /**
   * @description Gets recent documentation changes
   * @returns {Promise<{lastUpdate: Date, changes: Change[]}>}
   */
  async getRecentDocChanges() {
    try {
      const { stdout: docFiles } = await execAsync('find docs/architecture -name "*.md" -type f');
      const files = docFiles.split('\n').filter(Boolean);
      const changes = [];

      for (const file of files) {
        const stat = await fs.stat(file);
        changes.push({
          file,
          lastModified: stat.mtime,
          type: 'doc',
        });
      }

      return {
        lastUpdate: new Date(Math.max(...changes.map((c) => c.lastModified))),
        changes,
      };
    } catch (error) {
      logger.error(`Failed to get doc changes: ${error.message}`);
      throw error;
    }
  }

  /**
   * @description Checks if documentation is out of sync
   * @param {{lastUpdate: Date}} codeChanges - Code changes
   * @param {{lastUpdate: Date}} docChanges - Documentation changes
   * @returns {boolean}
   */
  isOutOfSync(codeChanges, docChanges) {
    const timeDiff = codeChanges.lastUpdate - docChanges.lastUpdate;
    return timeDiff > 24 * 60 * 60 * 1000; // More than 1 day difference
  }

  /**
   * @description Identifies affected documentation areas
   * @param {{changes: Change[]}} codeChanges - Code changes
   * @returns {string[]}
   */
  getAffectedAreas(codeChanges) {
    const areas = new Set();

    codeChanges.changes.forEach((change) => {
      if (change.file.includes('models')) areas.add('database-schema');
      if (change.file.includes('auth')) areas.add('security-model');
      if (change.file.includes('tenant')) areas.add('multi-tenancy');
      if (change.file.includes('subscription')) areas.add('subscription-model');
      if (change.file.includes('api')) areas.add('system-design');
    });

    return Array.from(areas);
  }
}

// Usage
(async () => {
  const lifecycle = new DocumentationLifecycle();
  const analysis = await lifecycle.checkSyncStatus();
  console.log(JSON.stringify(analysis, null, 2));
})();