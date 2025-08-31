// src/domain/models/exam.model.js
import { Schema, model } from "mongoose";

/**
 * @typedef {Object} Exam
 * @property {string} _id - MongoDB ObjectId
 * @property {string} schoolId - School reference
 * @property {string} tenantId - Tenant identifier
 * @property {string} name - Exam name
 * @property {string} type - Exam type (unit_test|mid_term|final|surprise)
 * @property {string} description - Exam description
 * @property {Object} schedule - Exam schedule
 * @property {string[]} classes - Applicable class IDs
 * @property {string} academicYear - Academic year
 * @property {Object} configuration - Exam configuration
 * @property {Object} results - Results configuration
 * @property {string} status - Status (draft|scheduled|ongoing|completed|cancelled)
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 * @property {string} createdBy - Creator's user ID
 */
const examSchema = new Schema({
  schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true },
  tenantId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ["unit_test", "mid_term", "final", "surprise"],
    required: true,
  },
  description: String,
  schedule: {
    startDate: Date,
    endDate: Date,
    resultDate: Date,
    subjects: [
      {
        subjectId: { type: Schema.Types.ObjectId, ref: "Subject" },
        subjectName: String,
        date: Date,
        startTime: String,
        duration: Number,
        maxMarks: Number,
        passingMarks: Number,
        room: String,
        invigilator: { type: Schema.Types.ObjectId, ref: "User" },
      },
    ],
  },
  classes: [{ type: Schema.Types.ObjectId, ref: "Class" }],
  academicYear: { type: String, required: true },
  configuration: {
    gradingSystem: { type: String, enum: ["marks", "grades", "both"] },
    allowReexam: Boolean,
    negativeMarking: Boolean,
    negativeMarkingRatio: Number,
    instructions: [String],
    requiredMaterials: [String],
  },
  results: {
    published: Boolean,
    publishDate: Date,
    showDetailedMarks: Boolean,
    showRanking: Boolean,
    autoGenerateReportCard: Boolean,
  },
  status: {
    type: String,
    enum: ["draft", "scheduled", "ongoing", "completed", "cancelled"],
    default: "draft",
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
});

examSchema.index({ schoolId: 1, academicYear: 1, status: 1 });
examSchema.index({ tenantId: 1, "schedule.startDate": 1 });
examSchema.index({ classes: 1, status: 1 });

export const Exam = model("Exam", examSchema);
