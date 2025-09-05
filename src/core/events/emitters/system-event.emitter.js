// src/core/events/emitters/system-event.emitter.js
import { EventEmitter as NodeEventEmitter } from "events";
import { logger } from "#utils/core/logger.js";

/**
 * @description Custom event emitter for system events with proper error handling
 * @extends {NodeEventEmitter}
 */
class EventEmitter extends NodeEventEmitter {
  /**
   * @description Initializes the event emitter with tenant context
   * @param {Object} [context={}] - Request context (tenantId, userId, requestId)
   */
  constructor(context = {}) {
    super();
    
    // ✅ FIX: Set maxListeners properly with fallback
    this.setMaxListeners(50);
    
    this.context = {
      tenantId: context.tenantId || 'default-tenant',
      userId: context.userId || null,
      requestId: context.requestId || null,
    };

    // Add error handling for the EventEmitter itself
    this.on('error', (error) => {
      logger.error('EventEmitter internal error:', {
        error: error.message,
        tenantId: this.context.tenantId,
        stack: error.stack
      });
    });
  }

  /**
   * @description Safely emits an event with audit logging
   * @param {string} event - Event name
   * @param {Object} payload - Event payload
   * @returns {boolean} Whether the event was emitted successfully
   */
  async safeEmit(event, payload) {
    try {
      // Use dynamic import for AuditService to avoid circular dependency
      const { AuditService } = await import("#core/audit/services/audit-log.service.js");
      
      // Log event to audit service (with error handling)
      try {
        await AuditService.log(
          "SYSTEM_EVENT_EMITTED",
          {
            event,
            payload,
            tenantId: this.context.tenantId,
          },
          this.context,
        );
      } catch (auditError) {
        // Don't fail event emission if audit fails
        logger.warn('Audit logging failed for event:', {
          event,
          error: auditError.message,
          tenantId: this.context.tenantId
        });
      }

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
      
      // Don't throw error, just log and continue
      return false;
    }
  }

  /**
   * @description Override emit to use safeEmit
   * @param {string} event - Event name
   * @param {...any} args - Event arguments
   * @returns {boolean} Whether the event was emitted successfully
   */
  emit(event, ...args) {
    try {
      return super.emit(event, ...args);
    } catch (error) {
      logger.error(`Event emission error: ${event}`, {
        error: error.message,
        tenantId: this.context.tenantId
      });
      return false;
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
          stack: error.stack
        });
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
            stack: error.stack
          },
        );
      }
    };
    return super.once(event, asyncListener);
  }
}

// Export singleton instance for system-wide use
const systemEventEmitter = new EventEmitter();

export { EventEmitter, systemEventEmitter };
export default systemEventEmitter;
