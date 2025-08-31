// src/domain/models/subject.model.js
import { Schema, model } from "mongoose";

/**
 * @typedef {Object} Subject
 * @property {string} _id - MongoDB ObjectId
 * @property {string} schoolId - School reference
 * @property {string} tenantId - Tenant identifier
 * @property {string} name - Subject name
 * @property {string} code - Subject code
 * @property {string} description - Subject description
 * @property {string} category - Category (core|elective|language)
 * @property {string} type - Type (theory|practical|both)
 * @property {Object} grading - Grading configuration
 * @property {Object[]} applicableClasses - Applicable classes
 * @property {Object} syllabus - Syllabus details
 * @property {string} status - Status (active|inactive)
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 * @property {string} createdBy - Creator's user ID
 */
const subjectSchema = new Schema({
  schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true },
  tenantId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  code: { type: String, required: true },
  description: String,
  category: {
    type: String,
    enum: ["core", "elective", "language"],
    required: true,
  },
  type: { type: String, enum: ["theory", "practical", "both"], required: true },
  grading: {
    maxMarks: Number,
    passingMarks: Number,
    gradeScale: String,
  },
  applicableClasses: [
    {
      classId: { type: Schema.Types.ObjectId, ref: "Class" },
      grade: Number,
      isCompulsory: Boolean,
      credits: Number,
    },
  ],
  syllabus: {
    document: String,
    chapters: [
      {
        number: Number,
        title: String,
        description: String,
        estimatedHours: Number,
      },
    ],
  },
  status: { type: String, enum: ["active", "inactive"], default: "active" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
});

subjectSchema.index({ schoolId: 1, code: 1 }, { unique: true });
subjectSchema.index({ tenantId: 1, category: 1, status: 1 });

export const Subject = model("Subject", subjectSchema);
