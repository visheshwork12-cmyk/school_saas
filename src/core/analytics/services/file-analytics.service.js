// src/core/analytics/services/file-analytics.service.js
import { AuditService } from '#core/audit/services/audit-log.service.js';
import File from '#domain/models/shared/file.model.js';

export class FileAnalyticsService {
  static async getUploadStats(tenantId, dateRange = {}) {
    const { startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), endDate = new Date() } = dateRange;
    
    const stats = await File.aggregate([
      {
        $match: {
          tenantId,
          uploadedAt: { $gte: startDate, $lte: endDate },
          status: 'active'
        }
      },
      {
        $group: {
          _id: null,
          totalFiles: { $sum: 1 },
          totalSize: { $sum: '$size' },
          avgFileSize: { $avg: '$size' },
          fileTypes: { $addToSet: '$mimeType' },
          categories: { $addToSet: '$category' }
        }
      }
    ]);
    
    return stats[0] || {
      totalFiles: 0,
      totalSize: 0,
      avgFileSize: 0,
      fileTypes: [],
      categories: []
    };
  }
}
