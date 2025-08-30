Security Model
1. Security Architecture Overview
1.1 Multi-Layer Security Model

Network Layer: Firewall, WAF, DDoS protection.
Application Layer: JWT, RBAC, input validation.
Data Layer: Encryption, access control.
Monitoring Layer: Audit logging, intrusion detection.

2. Authentication
2.1 JWT Implementation

Access token (short-lived) for API calls.
Refresh token (long-lived) for token renewal.
Tenant ID embedded in token payload.

2.2 Authentication Middleware
// src/shared/middleware/auth.middleware.js
import { verifyToken } from '#utils/jwt.js';
import { logger } from '#utils/core/logger.js';

export const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('Authentication failed', { error });
    res.status(401).json({ error: 'Invalid token' });
  }
};

3. Authorization
3.1 RBAC Implementation

Roles: admin, teacher, student, parent.
Permissions: users.read, students.write, etc.
Tenant-scoped permissions.

3.2 RBAC Middleware
// src/shared/middleware/rbac.middleware.js
import { hasPermission } from '#core/rbac/hasPermission.js';

export const requirePermission = (permission) => (req, res, next) => {
  if (!hasPermission(req.user, permission, req.context.tenantId)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

4. Data Security
4.1 Encryption

Passwords: bcrypt hashing.
Sensitive data: AES encryption for PII.
At-rest encryption in MongoDB.

4.2 Input Protection

Sanitization: express-mongo-sanitize, xss-clean.
Rate limiting: express-rate-limit with Redis store.

5. Audit Logging
5.1 Audit Log Schema
// src/domain/models/audit-log.model.js
import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  eventType: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tenantId: { type: String, required: true },
  action: { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed },
  ipAddress: String,
  userAgent: String,
  timestamp: { type: Date, default: Date.now },
});

auditLogSchema.index({ tenantId: 1, timestamp: -1 });
export default mongoose.model('AuditLog', auditLogSchema);

5.2 Logging Implementation
// src/utils/core/audit-logger.js
import AuditLog from '#domain/models/audit-log.model.js';
import { logger } from '#utils/core/logger.js';

export const auditLog = async (eventType, data) => {
  try {
    await AuditLog.create({
      eventType,
      ...data,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });
  } catch (error) {
    logger.error('Audit logging failed', { error });
  }
};

Last Updated: August 25, 2025Version: 1.0