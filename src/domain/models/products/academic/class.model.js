// src/domain/models/class.model.js
import { Schema, model } from 'mongoose';

/**
 * @typedef {Object} Class
 * @property {string} _id - MongoDB ObjectId
 * @property {string} schoolId - School reference
 * @property {string} tenantId - Tenant identifier
 * @property {string} name - Class name (e.g., "Class 10")
 * @property {string} code - Class code (e.g., "X")
 * @property {string} section - Section (e.g., "A")
 * @property {number} grade - Grade number
 * @property {string} academicYear - Academic year (e.g., "2024-25")
 * @property {string} status - Status (active|inactive)
 * @property {string} classTeacher - Primary teacher ID
 * @property {Object[]} subjects - Subject details
 * @property {Object} capacity - Student capacity
 * @property {Object} schedule - Class schedule
 * @property {Object} metadata - Flexible metadata
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 * @property {string} createdBy - Creator's user ID
 */
const classSchema = new Schema({
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
  tenantId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  code: { type: String, required: true },
  section: { type: String, required: true },
  grade: Number,
  academicYear: { type: String, required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  classTeacher: { type: Schema.Types.ObjectId, ref: 'User' },
  subjects: [
    {
      subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
      subjectName: String,
      teacher: { type: Schema.Types.ObjectId, ref: 'User' },
      isOptional: Boolean,
      credits: Number,
    },
  ],
  capacity: {
    maxStudents: Number,
    currentStudents: Number,
  },
  schedule: {
    periods: [
      {
        period: Number,
        startTime: String,
        endTime: String,
        subject: String,
        teacher: { type: Schema.Types.ObjectId, ref: 'User' },
        room: String,
      },
    ],
    days: [String],
  },
  metadata: { description: String, specialization: String, stream: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
});

classSchema.index({ schoolId: 1, academicYear: 1, status: 1 });
classSchema.index({ tenantId: 1, name: 1, section: 1 }, { unique: true });
classSchema.index({ classTeacher: 1 });

export const Class = model('Class', classSchema);