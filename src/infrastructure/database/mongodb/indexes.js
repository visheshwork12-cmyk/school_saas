// src/infrastructure/database/mongodb/indexes.js - Comprehensive database indexing
import mongoose from "mongoose";
import { logger } from "#utils/core/logger.js";
import { getConnection } from "#shared/database/connection-manager.js";

/**
 * Database Index Manager
 * Handles creation and optimization of MongoDB indexes for performance
 */
class DatabaseIndexManager {
  constructor() {
    this.indexOperations = [];
    this.indexStats = {
      created: 0,
      skipped: 0,
      errors: 0,
    };
  }

  /**
   * Create all database indexes
   */
  async createIndexes(tenantId = "default") {
    try {
      logger.info("🔍 Starting database index creation...");
      const startTime = Date.now();

      const connection = getConnection(tenantId);
      if (!connection) {
        throw new Error(`No database connection found for tenant: ${tenantId}`);
      }

      // Core collection indexes
      await this.createOrganizationIndexes(connection);
      await this.createUserIndexes(connection);
      await this.createSchoolIndexes(connection);
      await this.createStudentIndexes(connection);
      await this.createTeacherIndexes(connection);
      await this.createClassIndexes(connection);
      await this.createSubjectIndexes(connection);
      await this.createAttendanceIndexes(connection);
      await this.createGradeIndexes(connection);
      await this.createFeeIndexes(connection);
      await this.createLibraryIndexes(connection);
      await this.createTransportIndexes(connection);
      await this.createCommunicationIndexes(connection);
      await this.createAuditIndexes(connection);

      // Create custom compound indexes
      await this.createCompoundIndexes(connection);

      // Create text search indexes
      await this.createTextSearchIndexes(connection);

      // Create geospatial indexes
      await this.createGeospatialIndexes(connection);

      const duration = Date.now() - startTime;
      logger.info(`✅ Database indexes created successfully in ${duration}ms`, {
        created: this.indexStats.created,
        skipped: this.indexStats.skipped,
        errors: this.indexStats.errors,
        tenantId,
      });

      return this.indexStats;
    } catch (error) {
      logger.error(`❌ Index creation failed: ${error.message}`, {
        stack: error.stack,
        tenantId,
      });
      throw error;
    }
  }

  async createOrganizationIndexes(connection) {
    const Organization = connection.model("Organization");

    await this.createIndex(Organization, "organizations", [
      // Primary indexes
      { fields: { slug: 1 }, options: { unique: true, sparse: true } },
      { fields: { email: 1 }, options: { unique: true, sparse: true } },
      { fields: { domain: 1 }, options: { unique: true, sparse: true } },

      // Status and type indexes
      { fields: { status: 1, createdAt: -1 } },
      { fields: { type: 1, status: 1 } },
      { fields: { subscription: 1, status: 1 } },

      // Search and filtering
      { fields: { name: "text", description: "text" } },
      { fields: { tags: 1 } },
      { fields: { settings: 1 } },
    ]);
  }

  async createUserIndexes(connection) {
    const User = connection.model("User");

    await this.createIndex(User, "users", [
      // Authentication indexes
      { fields: { email: 1 }, options: { unique: true } },
      { fields: { username: 1 }, options: { unique: true, sparse: true } },
      { fields: { phone: 1 }, options: { sparse: true } },

      // Multi-tenant indexes
      { fields: { organizationId: 1, email: 1 }, options: { unique: true } },
      { fields: { organizationId: 1, role: 1, status: 1 } },
      { fields: { organizationId: 1, createdAt: -1 } },

      // Role and permission indexes
      { fields: { role: 1, status: 1 } },
      { fields: { permissions: 1 } },
      { fields: { departments: 1 } },

      // Session and security indexes
      { fields: { lastLoginAt: -1 } },
      { fields: { status: 1, lastLoginAt: -1 } },
      { fields: { verificationToken: 1 }, options: { sparse: true } },
      { fields: { resetPasswordToken: 1 }, options: { sparse: true } },

      // Profile indexes
      { fields: { firstName: "text", lastName: "text", email: "text" } },
      { fields: { isActive: 1, createdAt: -1 } },
    ]);
  }

  async createSchoolIndexes(connection) {
    const School = connection.model("School");

    await this.createIndex(School, "schools", [
      // Primary indexes
      { fields: { organizationId: 1, code: 1 }, options: { unique: true } },
      { fields: { organizationId: 1, name: 1 } },

      // Location indexes
      { fields: { "address.city": 1, "address.state": 1 } },
      { fields: { "address.pincode": 1 } },
      { fields: { location: "2dsphere" } }, // Geospatial index

      // Academic indexes
      { fields: { academicYear: 1, status: 1 } },
      { fields: { type: 1, board: 1 } },
      { fields: { medium: 1 } },

      // Search indexes
      { fields: { name: "text", description: "text", "address.area": "text" } },
    ]);
  }

  async createStudentIndexes(connection) {
    const Student = connection.model("Student");

    await this.createIndex(Student, "students", [
      // Primary identification
      {
        fields: { organizationId: 1, studentId: 1 },
        options: { unique: true },
      },
      {
        fields: { organizationId: 1, rollNumber: 1, academicYear: 1 },
        options: { unique: true },
      },

      // Class and section indexes
      { fields: { organizationId: 1, classId: 1, section: 1, status: 1 } },
      { fields: { organizationId: 1, academicYear: 1, classId: 1 } },

      // Student information
      {
        fields: { organizationId: 1, admissionNumber: 1 },
        options: { unique: true },
      },
      { fields: { organizationId: 1, dateOfBirth: 1 } },
      { fields: { organizationId: 1, gender: 1 } },
      { fields: { organizationId: 1, category: 1 } },

      // Parent information
      { fields: { "parent.email": 1 }, options: { sparse: true } },
      { fields: { "parent.phone": 1 }, options: { sparse: true } },

      // Search indexes
      {
        fields: {
          firstName: "text",
          lastName: "text",
          "parent.fatherName": "text",
          "parent.motherName": "text",
        },
      },

      // Status and dates
      { fields: { status: 1, createdAt: -1 } },
      { fields: { admissionDate: -1 } },
    ]);
  }

  async createTeacherIndexes(connection) {
    const Teacher = connection.model("Teacher");

    await this.createIndex(Teacher, "teachers", [
      // Primary identification
      {
        fields: { organizationId: 1, employeeId: 1 },
        options: { unique: true },
      },
      { fields: { organizationId: 1, email: 1 }, options: { unique: true } },

      // Department and subjects
      { fields: { organizationId: 1, department: 1, status: 1 } },
      { fields: { organizationId: 1, subjects: 1 } },
      { fields: { organizationId: 1, classes: 1 } },

      // Personal information
      { fields: { organizationId: 1, phone: 1 }, options: { sparse: true } },
      { fields: { organizationId: 1, qualification: 1 } },
      { fields: { organizationId: 1, experience: 1 } },

      // Employment details
      { fields: { joiningDate: -1 } },
      { fields: { designation: 1, status: 1 } },

      // Search indexes
      { fields: { firstName: "text", lastName: "text", email: "text" } },
    ]);
  }

  async createClassIndexes(connection) {
    const Class = connection.model("Class");

    await this.createIndex(Class, "classes", [
      // Primary indexes
      {
        fields: { organizationId: 1, name: 1, academicYear: 1 },
        options: { unique: true },
      },
      { fields: { organizationId: 1, classTeacher: 1 } },

      // Academic structure
      { fields: { organizationId: 1, grade: 1, section: 1 } },
      { fields: { organizationId: 1, academicYear: 1, status: 1 } },

      // Capacity and strength
      { fields: { capacity: 1, currentStrength: 1 } },
    ]);
  }

  async createSubjectIndexes(connection) {
    const Subject = connection.model("Subject");

    await this.createIndex(Subject, "subjects", [
      // Primary indexes
      { fields: { organizationId: 1, code: 1 }, options: { unique: true } },
      { fields: { organizationId: 1, name: 1, type: 1 } },

      // Classification
      { fields: { organizationId: 1, type: 1, status: 1 } },
      { fields: { organizationId: 1, category: 1 } },
      { fields: { organizationId: 1, isElective: 1 } },
    ]);
  }

  async createAttendanceIndexes(connection) {
    const Attendance = connection.model("Attendance");

    await this.createIndex(Attendance, "attendance", [
      // Primary tracking
      {
        fields: { organizationId: 1, studentId: 1, date: 1 },
        options: { unique: true },
      },
      { fields: { organizationId: 1, classId: 1, date: 1 } },

      // Date range queries
      { fields: { organizationId: 1, date: -1, status: 1 } },
      { fields: { organizationId: 1, studentId: 1, date: -1 } },

      // Subject-wise attendance
      { fields: { organizationId: 1, subjectId: 1, date: 1 } },
      { fields: { organizationId: 1, teacherId: 1, date: 1 } },

      // Status tracking
      { fields: { status: 1, date: -1 } },
      { fields: { organizationId: 1, academicYear: 1, month: 1 } },
    ]);
  }

  async createGradeIndexes(connection) {
    const Grade = connection.model("Grade");

    await this.createIndex(Grade, "grades", [
      // Primary indexes
      {
        fields: { organizationId: 1, studentId: 1, subjectId: 1, examId: 1 },
        options: { unique: true },
      },

      // Student performance tracking
      { fields: { organizationId: 1, studentId: 1, academicYear: 1, term: 1 } },
      { fields: { organizationId: 1, classId: 1, subjectId: 1, examId: 1 } },

      // Grade analysis
      { fields: { organizationId: 1, subjectId: 1, grade: 1 } },
      { fields: { organizationId: 1, marks: 1, grade: 1 } },

      // Time-based queries
      { fields: { examDate: -1, createdAt: -1 } },
    ]);
  }

  async createFeeIndexes(connection) {
    const Fee = connection.model("Fee");

    await this.createIndex(Fee, "fees", [
      // Primary tracking
      {
        fields: {
          organizationId: 1,
          studentId: 1,
          feeType: 1,
          academicYear: 1,
          term: 1,
        },
        options: { unique: true },
      },

      // Payment tracking
      { fields: { organizationId: 1, studentId: 1, status: 1 } },
      { fields: { organizationId: 1, dueDate: 1, status: 1 } },
      { fields: { organizationId: 1, paymentDate: -1 } },

      // Financial analysis
      { fields: { organizationId: 1, feeType: 1, academicYear: 1 } },
      { fields: { organizationId: 1, amount: 1, status: 1 } },

      // Overdue fees
      { fields: { dueDate: 1, status: 1 } },
    ]);
  }

  async createLibraryIndexes(connection) {
    const Book = connection.model("Book");
    const BookIssue = connection.model("BookIssue");

    // Book indexes
    await this.createIndex(Book, "books", [
      { fields: { organizationId: 1, isbn: 1 }, options: { unique: true } },
      {
        fields: {
          organizationId: 1,
          title: "text",
          author: "text",
          publisher: "text",
        },
      },
      { fields: { organizationId: 1, category: 1, status: 1 } },
      { fields: { organizationId: 1, available: 1 } },
    ]);

    // Book issue indexes
    await this.createIndex(BookIssue, "bookissues", [
      { fields: { organizationId: 1, studentId: 1, bookId: 1, issueDate: 1 } },
      { fields: { organizationId: 1, status: 1, dueDate: 1 } },
      { fields: { organizationId: 1, returnDate: -1 } },
    ]);
  }

  async createTransportIndexes(connection) {
    const Transport = connection.model("Transport");

    await this.createIndex(Transport, "transport", [
      {
        fields: { organizationId: 1, studentId: 1, routeId: 1 },
        options: { unique: true },
      },
      { fields: { organizationId: 1, routeId: 1, status: 1 } },
      { fields: { organizationId: 1, vehicleNumber: 1 } },
      { fields: { "pickup.location": "2dsphere" } },
      { fields: { "drop.location": "2dsphere" } },
    ]);
  }

  async createCommunicationIndexes(connection) {
    const Communication = connection.model("Communication");

    await this.createIndex(Communication, "communications", [
      { fields: { organizationId: 1, type: 1, createdAt: -1 } },
      { fields: { organizationId: 1, recipients: 1, status: 1 } },
      { fields: { organizationId: 1, sender: 1, createdAt: -1 } },
      { fields: { organizationId: 1, priority: 1, status: 1 } },
      { fields: { scheduledAt: 1, status: 1 } },
    ]);
  }

  async createAuditIndexes(connection) {
    const AuditLog = connection.model("AuditLog");

    await this.createIndex(AuditLog, "auditlogs", [
      { fields: { organizationId: 1, action: 1, createdAt: -1 } },
      { fields: { organizationId: 1, userId: 1, createdAt: -1 } },
      { fields: { organizationId: 1, resource: 1, action: 1 } },
      { fields: { organizationId: 1, ipAddress: 1, createdAt: -1 } },
      { fields: { createdAt: -1 } }, // TTL index for log rotation
      // TTL index to automatically delete old audit logs
      { fields: { createdAt: 1 }, options: { expireAfterSeconds: 7776000 } }, // 90 days
    ]);
  }

  async createCompoundIndexes(connection) {
    logger.info("Creating compound indexes...");

    // User activity compound index
    const User = connection.model("User");
    await this.createSingleIndex(
      User,
      { organizationId: 1, isActive: 1, role: 1, lastLoginAt: -1 },
      { name: "user_activity_compound" },
    );

    // Student academic performance compound index
    const Student = connection.model("Student");
    await this.createSingleIndex(
      Student,
      { organizationId: 1, academicYear: 1, classId: 1, section: 1, status: 1 },
      { name: "student_academic_compound" },
    );

    // Attendance summary compound index
    const Attendance = connection.model("Attendance");
    await this.createSingleIndex(
      Attendance,
      { organizationId: 1, academicYear: 1, classId: 1, date: -1, status: 1 },
      { name: "attendance_summary_compound" },
    );
  }

  async createTextSearchIndexes(connection) {
    logger.info("Creating text search indexes...");

    // Global search index for students
    const Student = connection.model("Student");
    await this.createSingleIndex(
      Student,
      {
        firstName: "text",
        lastName: "text",
        studentId: "text",
        rollNumber: "text",
        admissionNumber: "text",
        "parent.fatherName": "text",
        "parent.motherName": "text",
      },
      {
        name: "student_global_search",
        weights: {
          firstName: 10,
          lastName: 10,
          studentId: 8,
          rollNumber: 6,
          admissionNumber: 6,
          "parent.fatherName": 4,
          "parent.motherName": 4,
        },
      },
    );

    // Global search index for teachers
    const Teacher = connection.model("Teacher");
    await this.createSingleIndex(
      Teacher,
      {
        firstName: "text",
        lastName: "text",
        employeeId: "text",
        email: "text",
        subjects: "text",
        department: "text",
      },
      {
        name: "teacher_global_search",
        weights: {
          firstName: 10,
          lastName: 10,
          employeeId: 8,
          email: 6,
          subjects: 4,
          department: 4,
        },
      },
    );
  }

  async createGeospatialIndexes(connection) {
    logger.info("Creating geospatial indexes...");

    // School location index
    const School = connection.model("School");
    await this.createSingleIndex(
      School,
      { location: "2dsphere" },
      { name: "school_location" },
    );

    // Transport route indexes
    const Transport = connection.model("Transport");
    await this.createSingleIndex(
      Transport,
      { "route.coordinates": "2dsphere" },
      { name: "transport_route" },
    );
    await this.createSingleIndex(
      Transport,
      { "pickup.coordinates": "2dsphere" },
      { name: "transport_pickup" },
    );
    await this.createSingleIndex(
      Transport,
      { "drop.coordinates": "2dsphere" },
      { name: "transport_drop" },
    );
  }

  async createIndex(Model, collectionName, indexes) {
    logger.debug(`Creating indexes for ${collectionName}...`);

    for (const indexConfig of indexes) {
      await this.createSingleIndex(
        Model,
        indexConfig.fields,
        indexConfig.options,
      );
    }
  }

  async createSingleIndex(Model, indexFields, options = {}) {
    try {
      const indexName = options.name || this.generateIndexName(indexFields);

      // Check if index already exists
      const existingIndexes = await Model.collection.getIndexes();
      if (existingIndexes[indexName]) {
        logger.debug(`Index ${indexName} already exists, skipping...`);
        this.indexStats.skipped++;
        return;
      }

      await Model.collection.createIndex(indexFields, {
        background: true,
        ...options,
      });

      logger.debug(`✅ Created index: ${indexName}`);
      this.indexStats.created++;
    } catch (error) {
      if (error.code === 11000 || error.codeName === "IndexOptionsConflict") {
        logger.debug(
          `Index already exists with different options: ${error.message}`,
        );
        this.indexStats.skipped++;
      } else {
        logger.error(`❌ Failed to create index: ${error.message}`);
        this.indexStats.errors++;
        throw error;
      }
    }
  }

  generateIndexName(fields) {
    const fieldNames = Object.keys(fields);
    return `${fieldNames.join("_")}_idx`;
  }

  /**
   * Drop all indexes (careful - only for development/testing)
   */
  async dropAllIndexes(tenantId = "default", excludeBuiltIn = true) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Cannot drop indexes in production environment");
    }

    logger.warn("🗑️ Dropping all database indexes...");

    const connection = getConnection(tenantId);
    const collections = await connection.db.listCollections().toArray();

    for (const collection of collections) {
      const coll = connection.db.collection(collection.name);
      const indexes = await coll.getIndexes();

      for (const indexName of Object.keys(indexes)) {
        if (excludeBuiltIn && indexName === "_id_") {
          continue; // Skip built-in _id index
        }

        try {
          await coll.dropIndex(indexName);
          logger.debug(`Dropped index: ${indexName} from ${collection.name}`);
        } catch (error) {
          logger.warn(`Failed to drop index ${indexName}: ${error.message}`);
        }
      }
    }

    logger.warn("🗑️ All indexes dropped");
  }

  /**
   * Get index statistics
   */
  async getIndexStats(tenantId = "default") {
    const connection = getConnection(tenantId);
    const collections = await connection.db.listCollections().toArray();
    const stats = {};

    for (const collection of collections) {
      const coll = connection.db.collection(collection.name);
      const indexes = await coll.getIndexes();
      const indexStats = await coll.stats();

      stats[collection.name] = {
        indexCount: Object.keys(indexes).length,
        indexSize: indexStats.totalIndexSize || 0,
        indexes: Object.keys(indexes),
      };
    }

    return stats;
  }
}

// Export singleton instance and utility functions
const indexManager = new DatabaseIndexManager();

export const createIndexes = (tenantId) => indexManager.createIndexes(tenantId);
export const dropAllIndexes = (tenantId, excludeBuiltIn) =>
  indexManager.dropAllIndexes(tenantId, excludeBuiltIn);
export const getIndexStats = (tenantId) => indexManager.getIndexStats(tenantId);
export default indexManager;
