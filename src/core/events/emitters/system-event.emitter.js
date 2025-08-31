import { EventEmitter as NodeEventEmitter } from "events";
import { logger } from "#utils/core/logger.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";
import baseConfig from "#shared/config/environments/base.config.js";
import { BusinessException } from "#shared/exceptions/business.exception.js";

/**
 * @description Custom event emitter for system events
 * @extends {NodeEventEmitter}
 */
class EventEmitter extends NodeEventEmitter {
  /**
   * @description Initializes the event emitter with tenant context
   * @param {Object} [context={}] - Request context (tenantId, userId, requestId)
   */
  constructor(context = {}) {
    super();
    this.context = {
      tenantId: context.tenantId || baseConfig.multiTenant.defaultTenantId,
      userId: context.userId || null,
      requestId: context.requestId || null,
    };

    // Set max listeners to prevent memory leak warnings
    this.setMaxListeners(baseConfig.events.maxListeners);
  }

  /**
   * @description Emits an event with audit logging
   * @param {string} event - Event name
   * @param {Object} payload - Event payload
   * @returns {boolean} Whether the event was emitted successfully
   */
  async emit(event, payload) {
    try {
      // Log event to audit service
      await AuditService.log(
        "SYSTEM_EVENT_EMITTED",
        {
          event,
          payload,
          tenantId: this.context.tenantId,
        },
        this.context,
      );

      logger.debug(`Emitting event: ${event}`, {
        tenantId: this.context.tenantId,
        payload,
      });

      // Emit event to listeners
      const result = super.emit(event, payload);

      if (!result) {
        logger.warn(`No listeners for event: ${event}`, {
          tenantId: this.context.tenantId,
        });
      }

      return result;
    } catch (error) {
      logger.error(`Failed to emit event: ${event}`, {
        error: error.message,
        tenantId: this.context.tenantId,
      });
      await AuditService.log(
        "EVENT_EMISSION_FAILED",
        {
          event,
          error: error.message,
        },
        this.context,
      );
      throw new BusinessException(`Event emission failed: ${event}`);
    }
  }

  /**
   * @description Registers an event listener with async support
   * @param {string} event - Event name
   * @param {Function} listener - Async event listener
   * @returns {this} EventEmitter instance
   */
  on(event, listener) {
    const asyncListener = async (...args) => {
      try {
        await listener(...args);
      } catch (error) {
        logger.error(`Event listener error for ${event}: ${error.message}`, {
          tenantId: this.context.tenantId,
        });
        await AuditService.log(
          "EVENT_LISTENER_ERROR",
          {
            event,
            error: error.message,
          },
          this.context,
        );
      }
    };
    return super.on(event, asyncListener);
  }

  /**
   * @description Registers a one-time event listener
   * @param {string} event - Event name
   * @param {Function} listener - Async event listener
   * @returns {this} EventEmitter instance
   */
  once(event, listener) {
    const asyncListener = async (...args) => {
      try {
        await listener(...args);
      } catch (error) {
        logger.error(
          `One-time event listener error for ${event}: ${error.message}`,
          {
            tenantId: this.context.tenantId,
          },
        );
        await AuditService.log(
          "EVENT_LISTENER_ERROR",
          {
            event,
            error: error.message,
          },
          this.context,
        );
      }
    };
    return super.once(event, asyncListener);
  }
}

export { EventEmitter };
