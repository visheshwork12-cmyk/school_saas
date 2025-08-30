// src/core/repositories/base/base.repository.js

import { logger } from '#utils/core/logger.js';

/**
 * @description Generic base repository with CRUD operations.
 * Supports multi-tenant filtering and soft deletes.
 * 
 * @typedef {import('mongoose').Model} Model
 * 
 * @example
 * class UserRepository extends BaseRepository {
 *   constructor() { super(UserModel); }
 * }
 */
class BaseRepository {
  /**
   * @param {Model} model - Mongoose model.
   */
  constructor(model) {
    this.model = model;
  }

  /**
   * @description Creates a document.
   * @param {Object} data - Data to create.
   * @param {Object} [options={}] - Mongoose options.
   * @returns {Promise<Object>} Created document.
   */
  async create(data, options = {}) {
    try {
      const doc = await this.model.create(data, options);
      logger.info(`Created document: ${doc._id}`);
      return doc;
    } catch (err) {
      logger.error(`Create error: ${err.message}`);
      throw err;
    }
  }

  /**
   * @description Finds by ID with tenant filter.
   * @param {string} id - Document ID.
   * @param {Object} [options={}] - Options including tenant.
   * @returns {Promise<Object|null>} Document or null.
   */
  async findById(id, options = {}) {
    const filter = { _id: id, isDeleted: false, ...this._tenantFilter(options.tenant) };
    return this.model.findOne(filter).exec();
  }

  /**
   * @description Finds one document.
   * @param {Object} filter - Query filter.
   * @param {Object} [options={}] - Options.
   * @returns {Promise<Object|null>} Document or null.
   */
  async findOne(filter, options = {}) {
    const tenantFilter = { ...filter, isDeleted: false, ...this._tenantFilter(options.tenant) };
    return this.model.findOne(tenantFilter).exec();
  }

  /**
   * @description Finds many documents.
   * @param {Object} filter - Query filter.
   * @param {Object} [options={}] - Options.
   * @returns {Promise<Array>} Documents.
   */
  async findMany(filter, options = {}) {
    const tenantFilter = { ...filter, isDeleted: false, ...this._tenantFilter(options.tenant) };
    return this.model.find(tenantFilter).exec();
  }

  /**
   * @description Updates a document.
   * @param {string} id - ID.
   * @param {Object} data - Update data.
   * @param {Object} [options={}] - Options.
   * @returns {Promise<Object|null>} Updated document.
   */
  async update(id, data, options = {}) {
    const filter = { _id: id, isDeleted: false, ...this._tenantFilter(options.tenant) };
    return this.model.findOneAndUpdate(filter, data, { new: true, ...options }).exec();
  }

  /**
   * @description Soft deletes a document.
   * @param {string} id - ID.
   * @param {Object} [options={}] - Options including deletedBy.
   * @returns {Promise<Object|null>} Deleted document.
   */
  async delete(id, options = {}) {
    const update = { isDeleted: true, deletedAt: new Date(), deletedBy: options.deletedBy };
    return this.update(id, update, options);
  }

  /**
   * @description Paginates results.
   * @param {Object} filter - Filter.
   * @param {Object} options - Pagination options.
   * @returns {Promise<{ data: Array, meta: Object }>} Paginated data.
   */
  async paginate(filter, options) {
    // Use paginationHelper for efficiency
    const { paginationHelper } = await import('#utils/helpers/pagination.helper.js');
    return paginationHelper.paginate(this.model, { ...filter, ...this._tenantFilter(options.tenant) }, options);
  }

  /**
   * @description Adds tenant filter for multi-tenancy.
   * @param {Object} tenant - Tenant context.
   * @returns {Object} Filter.
   * @private
   */
  _tenantFilter(tenant) {
    return tenant ? { organizationId: tenant.organizationId, schoolId: tenant.schoolId } : {};
  }
}

export { BaseRepository };