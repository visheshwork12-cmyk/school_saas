// src/shared/utils/helpers/pagination.helper.js

import { logger } from "#utils/core/logger.js";

/**
 * @description Helper for pagination logic.
 * Supports offset-based and cursor-based pagination.
 *
 * @typedef {Object} PaginationOptions
 * @property {number} [page=1] - Page number (offset-based).
 * @property {number} [limit=10] - Items per page.
 * @property {string} [cursor] - Cursor for cursor-based.
 *
 * @typedef {Object} PaginationMeta
 * @property {number} total - Total items.
 * @property {number} page - Current page.
 * @property {number} limit - Items per page.
 * @property {boolean} hasNext - Has next page.
 * @property {boolean} hasPrev - Has previous page.
 * @property {string|null} nextCursor - Next cursor.
 * @property {string|null} prevCursor - Previous cursor.
 *
 * @example
 * const { query, meta } = await paginationHelper.paginate(Model, filter, options);
 */
class PaginationHelper {
  /**
   * @description Paginates a Mongoose query.
   * @param {import('mongoose').Model} model - Mongoose model.
   * @param {Object} filter - Query filter.
   * @param {PaginationOptions} options - Pagination options.
   * @returns {Promise<{ data: Array, meta: PaginationMeta }>} Paginated result.
   */
  async paginate(model, filter, options = {}) {
    try {
      const { page = 1, limit = 10, cursor } = options;
      const skip = (page - 1) * limit;

      let query = model.find(filter).limit(limit);

      if (cursor) {
        // Cursor-based for performance in large datasets
        query = query.where("_id").gt(cursor);
      } else {
        // Offset-based
        query = query.skip(skip);
      }

      const data = await query.exec();
      const total = await model.countDocuments(filter);

      const meta = {
        total,
        page,
        limit,
        hasNext: data.length === limit,
        hasPrev: page > 1,
        nextCursor:
          data.length > 0 ? data[data.length - 1]._id.toString() : null,
        prevCursor: null, // Implement if needed
      };

      return { data, meta };
    } catch (err) {
      logger.error(`Pagination error: ${err.message}`);
      throw err;
    }
  }
}

const paginationHelper = new PaginationHelper();

export { paginationHelper };
