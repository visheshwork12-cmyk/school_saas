// src/domain/models/attendance.model.js
import { Schema, model } from "mongoose";

/**
 * @typedef {Object} Attendance
 * @property {string} _id - MongoDB ObjectId
 * @property {string} schoolId - School reference
 * @property {string} tenantId - Tenant identifier
 * @property {Date} date - Attendance date
 * @property {string} classId - Class reference
 * @property {string} subjectId - Subject reference
 * @property {number} period - Period number
 * @property {Object[]} records - Attendance records
 * @property {Object} summary - Attendance summary
 * @property {string} academicYear - Academic year
 * @property {string} term - Term (first|second|third)
 * @property {string} status - Status (draft|submitted|locked)
 * @property {Date} submittedAt - Submission timestamp
 * @property {string} submittedBy - Submitter's user ID
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 */
const attendanceSchema = new Schema({
  schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true },
  tenantId: { type: String, required: true, index: true },
  date: { type: Date, required: true },
  classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
  subjectId: { type: Schema.Types.ObjectId, ref: "Subject" },
  period: Number,
  records: [
    {
      studentId: {
        type: Schema.Types.ObjectId,
        ref: "Student",
        required: true,
      },
      status: {
        type: String,
        enum: ["present", "absent", "late", "half_day"],
        required: true,
      },
      timeIn: Date,
      timeOut: Date,
      remarks: String,
      markedBy: { type: Schema.Types.ObjectId, ref: "User" },
      markedAt: Date,
    },
  ],
  summary: {
    totalStudents: Number,
    presentCount: Number,
    absentCount: Number,
    lateCount: Number,
    attendancePercentage: Number,
  },
  academicYear: { type: String, required: true },
  term: { type: String, enum: ["first", "second", "third"] },
  status: {
    type: String,
    enum: ["draft", "submitted", "locked"],
    default: "draft",
  },
  submittedAt: Date,
  submittedBy: { type: Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

attendanceSchema.index(
  { schoolId: 1, date: 1, classId: 1, subjectId: 1 },
  { unique: true },
);
attendanceSchema.index({ tenantId: 1, date: -1, classId: 1 });
attendanceSchema.index({ "records.studentId": 1, date: -1 });

export const Attendance = model("Attendance", attendanceSchema);
