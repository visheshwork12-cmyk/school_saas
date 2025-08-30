# Database Schema Design

## 1. Database Architecture Overview

### 1.1 Database Strategy
- **Database**: MongoDB v7.0.14 (Document Database)
- **Multi-tenancy**: Collection-level isolation with `tenantId`
- **Relationships**: Embedded documents and references
- **Indexing**: Compound indexes for performance

### 1.2 Naming Conventions
- **Collections**: PascalCase (e.g., `Users`, `Schools`)
- **Fields**: camelCase (e.g., `firstName`, `tenantId`)
- **Indexes**: Descriptive (e.g., `schoolId_email_unique`)

## 2. Core Platform Collections

### 2.1 Organizations Collection

// src/domain/models/platform/organization.model.js
import { Schema, model } from 'mongoose';

/**
 * @typedef {Object} Organization
 * @property {string} _id - MongoDB ObjectId
 * @property {string} name - Organization name
 * @property {string} slug - Unique slug
 * @property {string} type - Organization type (enterprise|individual)
 * @property {string} status - Status (active|suspended|inactive)
 * @property {Object} contactInfo - Contact details
 * @property {Object} billing - Billing information
 * @property {Object} limits - Resource limits
 * @property {Object} metadata - Flexible metadata
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 * @property {string} createdBy - Creator's user ID
 */
const organizationSchema = new Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  type: { type: String, enum: ['enterprise', 'individual'], required: true },
  status: { type: String, enum: ['active', 'suspended', 'inactive'], default: 'active' },
  contactInfo: {
    email: String,
    phone: String,
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      postalCode: String,
    },
  },
  billing: {
    planId: { type: Schema.Types.ObjectId, ref: 'Plan' },
    billingCycle: { type: String, enum: ['monthly', 'yearly'] },
    nextBillingDate: Date,
    paymentMethod: String,
    currency: { type: String, default: 'USD' },
  },
  limits: {
    maxSchools: Number,
    maxStudents: Number,
    maxStorage: Number,
  },
  metadata: Schema.Types.Mixed,
  tenantId: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
});

organizationSchema.index({ slug: 1 }, { unique: true });
organizationSchema.index({ status: 1, createdAt: -1 });

export const Organization = model('Organization', organizationSchema);

2.2 Schools Collection
// src/domain/models/school/school.model.js
import { Schema, model } from 'mongoose';

/**
 * @typedef {Object} School
 * @property {string} _id - MongoDB ObjectId
 * @property {string} organizationId - Parent organization ID
 * @property {string} tenantId - Unique tenant identifier
 * @property {string} name - School name
 * @property {string} slug - Unique slug
 * @property {string} code - Short code
 * @property {string} type - School type (primary|secondary|university)
 * @property {string} status - Status (active|inactive)
 * @property {Object} contactInfo - Contact details
 * @property {Object} academicInfo - Academic details
 * @property {Object} subscription - Subscription details
 * @property {Object} settings - Configuration settings
 * @property {Object} branding - Branding information
 * @property {Object} stats - Usage statistics
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 * @property {string} createdBy - Creator's user ID
 */
const schoolSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  tenantId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true },
  type: { type: String, enum: ['primary', 'secondary', 'university'], required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  contactInfo: {
    email: String,
    phone: String,
    website: String,
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      postalCode: String,
      coordinates: { latitude: Number, longitude: Number },
    },
  },
  academicInfo: {
    establishedYear: Number,
    affiliationBoard: String,
    academicYearStart: String,
    sessionTimings: {
      startTime: String,
      endTime: String,
      breaks: [{ name: String, startTime: String, endTime: String }],
    },
  },
  subscription: {
    planId: { type: Schema.Types.ObjectId, ref: 'Plan' },
    status: { type: String, enum: ['active', 'trial', 'expired'], default: 'trial' },
    startDate: Date,
    endDate: Date,
    features: [String],
    limits: { maxStudents: Number, maxTeachers: Number, storageQuota: Number },
  },
  settings: {
    timezone: { type: String, default: 'Asia/Kolkata' },
    locale: { type: String, default: 'en-IN' },
    currency: { type: String, default: 'INR' },
    dateFormat: { type: String, default: 'DD/MM/YYYY' },
    academicYear: String,
    features: {
      academic: Boolean,
      finance: Boolean,
      library: Boolean,
      transport: Boolean,
      hr: Boolean,
    },
    notifications: { email: Boolean, sms: Boolean, push: Boolean },
  },
  branding: {
    logo: String,
    colors: { primary: String, secondary: String, accent: String },
    customDomain: String,
  },
  stats: {
    totalStudents: Number,
    totalTeachers: Number,
    totalClasses: Number,
    lastActive: Date,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
});

schoolSchema.index({ organizationId: 1, status: 1 });
schoolSchema.index({ tenantId: 1 }, { unique: true });
schoolSchema.index({ slug: 1 }, { unique: true });
schoolSchema.index({ code: 1 }, { unique: true });

export const School = model('School', schoolSchema);

3. User Management Collections
3.1 Users Collection
// src/domain/models/school/user.model.js
import { Schema, model } from 'mongoose';

/**
 * @typedef {Object} User
 * @property {string} _id - MongoDB ObjectId
 * @property {string} schoolId - School reference
 * @property {string} tenantId - Tenant identifier
 * @property {Object} personalInfo - Personal details
 * @property {Object} auth - Authentication details
 * @property {string} role - User role (admin|teacher|student|parent)
 * @property {string[]} permissions - User permissions
 * @property {string} department - Department for teachers/staff
 * @property {string} status - Status (active|inactive|suspended)
 * @property {Object} preferences - User preferences
 * @property {Object[]} emergencyContacts - Emergency contact details
 * @property {Object} metadata - Flexible metadata
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 * @property {string} createdBy - Creator's user ID
 * @property {Date} lastActiveAt - Last active timestamp
 */
const userSchema = new Schema({
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
  tenantId: { type: String, required: true, index: true },
  personalInfo: {
    firstName: String,
    middleName: String,
    lastName: String,
    displayName: String,
    dateOfBirth: Date,
    gender: { type: String, enum: ['male', 'female', 'other'] },
    bloodGroup: String,
    photo: String,
    address: {
      current: { street: String, city: String, state: String, country: String, postalCode: String },
      permanent: { street: String, city: String, state: String, country: String, postalCode: String },
    },
  },
  auth: {
    email: { type: String, required: true, unique: true },
    emailVerified: Boolean,
    emailVerifiedAt: Date,
    phone: String,
    phoneVerified: Boolean,
    phoneVerifiedAt: Date,
    passwordHash: String,
    passwordChangedAt: Date,
    twoFactorEnabled: Boolean,
    twoFactorSecret: String,
    backupCodes: [String],
    lastLoginAt: Date,
    lastLoginIP: String,
    refreshTokens: [{ token: String, expiresAt: Date, createdAt: Date, deviceInfo: String }],
  },
  role: { type: String, enum: ['admin', 'teacher', 'student', 'parent'], required: true },
  permissions: [String],
  department: String,
  status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
  preferences: {
    language: { type: String, default: 'en' },
    timezone: String,
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    notifications: {
      email: Boolean,
      sms: Boolean,
      push: Boolean,
      frequency: { type: String, enum: ['immediate', 'daily', 'weekly'], default: 'immediate' },
    },
  },
  emergencyContacts: [
    { name: String, relationship: String, phone: String, email: String, isPrimary: Boolean },
  ],
  metadata: Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  lastActiveAt: Date,
});

userSchema.index({ schoolId: 1, email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, role: 1, status: 1 });
userSchema.index({ schoolId: 1, role: 1, department: 1 });
userSchema.index({ 'auth.email': 1 }, { unique: true, partialFilterExpression: { 'auth.email': { $exists: true } } });

export const User = model('User', userSchema);

4. Academic Management Collections
4.1 Classes Collection
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

4.2 Students Collection
// src/domain/models/student.model.js
import { Schema, model } from 'mongoose';

/**
 * @typedef {Object} Student
 * @property {string} _id - MongoDB ObjectId
 * @property {string} userId - User reference
 * @property {string} schoolId - School reference
 * @property {string} tenantId - Tenant identifier
 * @property {string} admissionNumber - Unique admission number
 * @property {string} rollNumber - Class roll number
 * @property {Object} academic - Academic details
 * @property {Object[]} parents - Parent/guardian details
 * @property {Object} medical - Medical information
 * @property {Object} transport - Transport details
 * @property {Object} fee - Fee information
 * @property {string} status - Status (active|inactive|graduated|transferred)
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 * @property {string} createdBy - Creator's user ID
 */
const studentSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
  tenantId: { type: String, required: true, index: true },
  admissionNumber: { type: String, required: true },
  rollNumber: String,
  academic: {
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    className: String,
    section: String,
    academicYear: String,
    admissionDate: Date,
    previousEducation: [
      {
        institution: String,
        class: String,
        yearCompleted: String,
        percentage: Number,
        board: String,
      },
    ],
  },
  parents: [
    {
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      relationship: String,
      name: String,
      occupation: String,
      phone: String,
      email: String,
      isPrimary: Boolean,
      canPickup: Boolean,
    },
  ],
  medical: {
    allergies: [String],
    medications: [String],
    medicalConditions: [String],
    doctorContact: { name: String, phone: String },
    insuranceDetails: { provider: String, policyNumber: String, validUntil: Date },
  },
  transport: {
    required: Boolean,
    routeId: { type: Schema.Types.ObjectId, ref: 'Route' },
    pickupPoint: String,
    dropPoint: String,
  },
  fee: {
    categoryId: { type: Schema.Types.ObjectId, ref: 'FeeStructure' },
    discountPercentage: Number,
    installmentPlan: { type: String, enum: ['monthly', 'quarterly', 'yearly'] },
    totalFee: Number,
    paidAmount: Number,
    pendingAmount: Number,
  },
  status: { type: String, enum: ['active', 'inactive', 'graduated', 'transferred'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
});

studentSchema.index({ schoolId: 1, admissionNumber: 1 }, { unique: true });
studentSchema.index({ tenantId: 1, 'academic.classId': 1, status: 1 });
studentSchema.index({ userId: 1 }, { unique: true });
studentSchema.index({ 'parents.userId': 1 });

export const Student = model('Student', studentSchema);

4.3 Subjects Collection
// src/domain/models/subject.model.js
import { Schema, model } from 'mongoose';

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
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
  tenantId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  code: { type: String, required: true },
  description: String,
  category: { type: String, enum: ['core', 'elective', 'language'], required: true },
  type: { type: String, enum: ['theory', 'practical', 'both'], required: true },
  grading: {
    maxMarks: Number,
    passingMarks: Number,
    gradeScale: String,
  },
  applicableClasses: [
    {
      classId: { type: Schema.Types.ObjectId, ref: 'Class' },
      grade: Number,
      isCompulsory: Boolean,
      credits: Number,
    },
  ],
  syllabus: {
    document: String,
    chapters: [{ number: Number, title: String, description: String, estimatedHours: Number }],
  },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
});

subjectSchema.index({ schoolId: 1, code: 1 }, { unique: true });
subjectSchema.index({ tenantId: 1, category: 1, status: 1 });

export const Subject = model('Subject', subjectSchema);

5. Assessment Collections
5.1 Exams Collection
// src/domain/models/exam.model.js
import { Schema, model } from 'mongoose';

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
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
  tenantId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['unit_test', 'mid_term', 'final', 'surprise'], required: true },
  description: String,
  schedule: {
    startDate: Date,
    endDate: Date,
    resultDate: Date,
    subjects: [
      {
        subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
        subjectName: String,
        date: Date,
        startTime: String,
        duration: Number,
        maxMarks: Number,
        passingMarks: Number,
        room: String,
        invigilator: { type: Schema.Types.ObjectId, ref: 'User' },
      },
    ],
  },
  classes: [{ type: Schema.Types.ObjectId, ref: 'Class' }],
  academicYear: { type: String, required: true },
  configuration: {
    gradingSystem: { type: String, enum: ['marks', 'grades', 'both'] },
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
  status: { type: String, enum: ['draft', 'scheduled', 'ongoing', 'completed', 'cancelled'], default: 'draft' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
});

examSchema.index({ schoolId: 1, academicYear: 1, status: 1 });
examSchema.index({ tenantId: 1, 'schedule.startDate': 1 });
examSchema.index({ classes: 1, status: 1 });

export const Exam = model('Exam', examSchema);

5.2 ExamResults Collection
// src/domain/models/exam-result.model.js
import { Schema, model } from 'mongoose';

/**
 * @typedef {Object} ExamResult
 * @property {string} _id - MongoDB ObjectId
 * @property {string} schoolId - School reference
 * @property {string} tenantId - Tenant identifier
 * @property {string} examId - Exam reference
 * @property {string} studentId - Student reference
 * @property {string} classId - Class reference
 * @property {Object[]} subjectResults - Subject-wise results
 * @property {Object} overall - Overall result
 * @property {Object} attendance - Exam attendance
 * @property {string} teacherRemarks - Teacher remarks
 * @property {string} principalRemarks - Principal remarks
 * @property {Date} publishedAt - Publication timestamp
 * @property {string} status - Status (draft|published|withheld)
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 * @property {string} createdBy - Creator's user ID
 */
const examResultSchema = new Schema({
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
  tenantId: { type: String, required: true, index: true },
  examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  subjectResults: [
    {
      subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
      subjectName: String,
      marksObtained: Number,
      maxMarks: Number,
      grade: String,
      percentage: Number,
      breakdown: { theory: Number, practical: Number, internal: Number, external: Number },
      remarks: String,
      absent: Boolean,
      malpractice: Boolean,
    },
  ],
  overall: {
    totalMarksObtained: Number,
    totalMaxMarks: Number,
    percentage: Number,
    grade: String,
    rank: Number,
    schoolRank: Number,
    result: { type: String, enum: ['pass', 'fail', 'distinction'] },
    division: { type: String, enum: ['first', 'second', 'third'] },
  },
  attendance: {
    totalDays: Number,
    presentDays: Number,
    absentDays: Number,
  },
  teacherRemarks: String,
  principalRemarks: String,
  publishedAt: Date,
  status: { type: String, enum: ['draft', 'published', 'withheld'], default: 'draft' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
});

examResultSchema.index({ schoolId: 1, examId: 1, studentId: 1 }, { unique: true });
examResultSchema.index({ tenantId: 1, studentId: 1, publishedAt: -1 });
examResultSchema.index({ examId: 1, 'overall.rank': 1 });

export const ExamResult = model('ExamResult', examResultSchema);

6. Attendance Collections
6.1 Attendance Collection
// src/domain/models/attendance.model.js
import { Schema, model } from 'mongoose';

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
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
  tenantId: { type: String, required: true, index: true },
  date: { type: Date, required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
  period: Number,
  records: [
    {
      studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
      status: { type: String, enum: ['present', 'absent', 'late', 'half_day'], required: true },
      timeIn: Date,
      timeOut: Date,
      remarks: String,
      markedBy: { type: Schema.Types.ObjectId, ref: 'User' },
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
  term: { type: String, enum: ['first', 'second', 'third'] },
  status: { type: String, enum: ['draft', 'submitted', 'locked'], default: 'draft' },
  submittedAt: Date,
  submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

attendanceSchema.index({ schoolId: 1, date: 1, classId: 1, subjectId: 1 }, { unique: true });
attendanceSchema.index({ tenantId: 1, date: -1, classId: 1 });
attendanceSchema.index({ 'records.studentId': 1, date: -1 });

export const Attendance = model('Attendance', attendanceSchema);

7. Financial Collections
7.1 FeeStructures Collection
// src/domain/models/fee-structure.model.js
import { Schema, model } from 'mongoose';

/**
 * @typedef {Object} FeeStructure
 * @property {string} _id - MongoDB ObjectId
 * @property {string} schoolId - School reference
 * @property {string} tenantId - Tenant identifier
 * @property {string} name - Fee structure name
 * @property {string} description - Fee structure description
 * @property {string} academicYear - Academic year
 * @property {Object} applicability - Applicability criteria
 * @property {Object[]} components - Fee components
 * @property {Object[]} discounts - Discount rules
 * @property {Object} paymentTerms - Payment terms
 * @property {Object} totals - Total amounts
 * @property {string} status - Status (draft|active|inactive)
 * @property {Date} effectiveFrom - Effective start date
 * @property {Date} effectiveTo - Effective end date
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 * @property {string} createdBy - Creator's user ID
 */
const feeStructureSchema = new Schema({
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
  tenantId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  description: String,
  academicYear: { type: String, required: true },
  applicability: {
    classes: [{ type: Schema.Types.ObjectId, ref: 'Class' }],
    categories: [String],
    newAdmissions: Boolean,
    existingStudents: Boolean,
  },
  components: [
    {
      name: String,
      code: String,
      amount: Number,
      type: { type: String, enum: ['mandatory', 'optional'] },
      frequency: { type: String, enum: ['one_time', 'monthly', 'quarterly', 'yearly'] },
      dueDate: Date,
      tax: { applicable: Boolean, rate: Number, type: String },
    },
  ],
  discounts: [
    {
      name: String,
      type: { type: String, enum: ['percentage', 'fixed'] },
      value: Number,
      conditions: String,
      maxAmount: Number,
    },
  ],
  paymentTerms: {
    installmentsAllowed: Boolean,
    numberOfInstallments: Number,
    installmentSchedule: [{ installmentNumber: Number, dueDate: Date, percentage: Number }],
    lateFee: { applicable: Boolean, amount: Number, graceDays: Number },
  },
  totals: {
    subtotal: Number,
    taxAmount: Number,
    discountAmount: Number,
    grandTotal: Number,
  },
  status: { type: String, enum: ['draft', 'active', 'inactive'], default: 'draft' },
  effectiveFrom: Date,
  effectiveTo: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
});

feeStructureSchema.index({ schoolId: 1, academicYear: 1, status: 1 });
feeStructureSchema.index({ tenantId: 1, 'applicability.classes': 1 });

export const FeeStructure = model('FeeStructure', feeStructureSchema);

7.2 FeeTransactions Collection
// src/domain/models/fee-transaction.model.js
import { Schema, model } from 'mongoose';

/**
 * @typedef {Object} FeeTransaction
 * @property {string} _id - MongoDB ObjectId
 * @property {string} schoolId - School reference
 * @property {string} tenantId - Tenant identifier
 * @property {string} transactionId - Unique transaction ID
 * @property {string} receiptNumber - Receipt number
 * @property {string} studentId - Student reference
 * @property {string} studentName - Student name (denormalized)
 * @property {string} classId - Class reference
 * @property {string} className - Class name (denormalized)
 * @property {string} feeStructureId - Fee structure reference
 * @property {string} academicYear - Academic year
 * @property {Object} payment - Payment details
 * @property {Object[]} components - Fee components paid
 * @property {Object} amounts - Payment amounts
 * @property {string} status - Status (pending|completed|failed|refunded)
 * @property {Date} paymentDate - Payment date
 * @property {Date} dueDate - Due date
 * @property {string} remarks - Remarks
 * @property {string} collectedBy - Staff who collected payment
 * @property {string} approvedBy - Approver for large amounts
 * @property {Object} refund - Refund details
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 */
const feeTransactionSchema = new Schema({
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
  tenantId: { type: String, required: true, index: true },
  transactionId: { type: String, required: true, unique: true },
  receiptNumber: { type: String, required: true, unique: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  studentName: String,
  classId: { type: Schema.Types.ObjectId, ref: 'Class' },
  className: String,
  feeStructureId: { type: Schema.Types.ObjectId, ref: 'FeeStructure' },
  academicYear: String,
  payment: {
    method: { type: String, enum: ['cash', 'card', 'upi', 'bank_transfer', 'cheque'] },
    amount: Number,
    currency: { type: String, default: 'INR' },
    details: {
      transactionId: String,
      gatewayResponse: Schema.Types.Mixed,
      chequeNumber: String,
      bankName: String,
      chequeDate: Date,
      referenceNumber: String,
      bankDetails: Schema.Types.Mixed,
    },
  },
  components: [
    {
      componentId: String,
      componentName: String,
      amount: Number,
      discountApplied: Number,
      taxAmount: Number,
      netAmount: Number,
    },
  ],
  amounts: {
    subtotal: Number,
    discountAmount: Number,
    taxAmount: Number,
    totalAmount: Number,
    paidAmount: Number,
    pendingAmount: Number,
  },
  status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
  paymentDate: Date,
  dueDate: Date,
  remarks: String,
  collectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  refund: {
    refunded: Boolean,
    refundAmount: Number,
    refundDate: Date,
    refundReason: String,
    refundMethod: String,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

feeTransactionSchema.index({ schoolId: 1, studentId: 1, academicYear: 1 });
feeTransactionSchema.index({ tenantId: 1, status: 1, paymentDate: -1 });
feeTransactionSchema.index({ transactionId: 1 }, { unique: true });
feeTransactionSchema.index({ receiptNumber: 1 }, { unique: true });

export const FeeTransaction = model('FeeTransaction', feeTransactionSchema);

8. Data Relationships & Integrity
erDiagram
    Organization ||--o{ School : contains
    School ||--o{ User : manages
    School ||--o{ Class : offers
    School ||--o{ Subject : offers
    School ||--o{ Student : enrolls
    School ||--o{ Exam : conducts
    School ||--o{ FeeStructure : defines
    School ||--o{ FeeTransaction : processes
    User ||--o{ Student : linked
    Class ||--o{ Student : enrolls
    Class ||--o{ Subject : teaches
    Class ||--o{ Exam : conducts
    Student ||--o{ ExamResult : achieves
    Student ||--o{ Attendance : records
    Exam ||--o{ ExamResult : generates
    FeeStructure ||--o{ FeeTransaction : applies

8.2 Data Consistency Rules

Every User must belong to a valid School.
Every Student must have a valid User record.
Every Class must belong to a valid School.
Soft delete for Users and Students (set status: 'deleted').
Cascade updates for denormalized fields (e.g., studentName in FeeTransaction).

8.3 Indexing Strategy

Tenant-based compound indexes for multi-tenancy.
Unique constraints for business rules (e.g., admissionNumber, email).
Text indexes for search (e.g., Users.personalInfo.displayName).


Last Updated: 2025-08-24Version: 1.0