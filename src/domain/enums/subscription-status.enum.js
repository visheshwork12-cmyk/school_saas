// src/domain/enums/subscription-status.enum.js

/**
 * @description Enum for subscription lifecycle states.
 *
 * @example
 * if (subscription.status === SUBSCRIPTION_STATUS.ACTIVE) { ... }
 */
const SUBSCRIPTION_STATUS = Object.freeze({
  TRIAL: "trial",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  PENDING: "pending",
});

export default SUBSCRIPTION_STATUS;
