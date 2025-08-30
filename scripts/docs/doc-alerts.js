// scripts/doc-alerts.js
import { logger } from '#utils/core/logger.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import { BusinessException } from '#shared/exceptions/business.exception.js';
import { DocumentationLifecycle } from '#scripts/doc-lifecycle.js';

/**
 * @description Sends alerts for outdated documentation
 */
export class DocumentationAlerts {
  /**
   * @description Checks for outdated documentation and sends alerts
   * @param {string} webhookUrl - Webhook URL for Slack/Discord
   * @returns {Promise<void>}
   */
  async checkAndSendAlerts(webhookUrl) {
    try {
      const lifecycle = new DocumentationLifecycle();
      const syncStatus = await lifecycle.checkSyncStatus();

      if (syncStatus.outOfSync) {
        const days = Math.floor(
          (Date.now() - syncStatus.lastDocUpdate.getTime()) / (24 * 60 * 60 * 1000)
        );

        for (const area of syncStatus.affectedAreas) {
          const message = `📚 Documentation for ${area} hasn't been updated in ${days} days. Recent code changes may not be reflected.`;
          await this.sendAlert(webhookUrl, {
            channel: '#dev-team',
            message,
          });

          await AuditService.log('DOC_ALERT_SENT', {
            action: 'send_doc_alert',
            area,
            daysOutOfSync: days,
          });
        }
      }
    } catch (error) {
      logger.error(`Failed to send documentation alerts: ${error.message}`);
      throw new BusinessException('Alert sending failed', 'ALERT_FAILED', 500);
    }
  }

  /**
   * @description Sends an alert to Slack/Discord
   * @param {string} webhookUrl - Webhook URL
   * @param {{channel: string, message: string}} payload - Alert payload
   * @returns {Promise<void>}
   */
  async sendAlert(webhookUrl, payload) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: payload.channel,
          text: payload.message,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      logger.info(`Alert sent to ${payload.channel}: ${payload.message}`);
    } catch (error) {
      logger.error(`Failed to send alert: ${error.message}`);
      throw error;
    }
  }
}

// Usage
(async () => {
  const alerts = new DocumentationAlerts();
  const webhookUrl = process.env.SLACK_WEBHOOK_URL || 'https://hooks.slack.com/services/xxx/yyy/zzz';
  await alerts.checkAndSendAlerts(webhookUrl);
})();