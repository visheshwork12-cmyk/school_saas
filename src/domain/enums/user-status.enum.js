// src/domain/enums/user-status.enum.js

/**
 * @description Enum for user status.
 * 
 * @example
 * if (user.status === USER_STATUS.ACTIVE) { ... }
 */
const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
  SUSPENDED: 'suspended',
  DELETED: 'deleted',
});

export default USER_STATUS;