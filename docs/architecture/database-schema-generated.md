# Database Schema (Auto-generated)
Generated: 2025-08-24T16:48:20.547Z
⚠️ This is auto-generated. Manual changes will be overwritten.

## Summary
- **Total Models Found**: 2
- **Errors**: 36
- **Last Updated**: 8/24/2025, 10:18:20 PM

## ⚠️ Errors Found

- **/src/domain/models/feature-flag.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/platform/billing.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/platform/client-version.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/platform/organization.model.js**: The requested module '#domain/enums/subscription-status.enum.js' does not provide an export named 'SUBSCRIPTION_STATUS'
- **/src/domain/models/platform/plan.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/platform/subscription.model.js**: The requested module '#domain/enums/subscription-status.enum.js' does not provide an export named 'SUBSCRIPTION_STATUS'
- **/src/domain/models/products/academic/assignment.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/academic/attendance.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/academic/class.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/academic/exam.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/academic/grade.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/academic/subject.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/finance/budget.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/finance/expense.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/finance/fee.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/finance/invoice.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/finance/payment.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/hr/attendance.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/hr/leave.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/hr/payroll.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/hr/performance.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/hr/staff.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/library/book.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/library/borrowing.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/library/fine.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/library/inventory.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/transport/driver.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/transport/route.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/transport/tracking.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/products/transport/vehicle.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/school/department.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/school/role.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/shared/audit-log.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/shared/file.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/shared/notification.model.js**: Not a valid Mongoose model - missing schema or modelName
- **/src/domain/models/shared/session.model.js**: Not a valid Mongoose model - missing schema or modelName

---


## School Collection

**File**: `/src/domain/models/school/school.model.js`

### Schema Definition
```javascript
{
  "name": {
    "type": "[Function]",
    "required": true,
    "trim": true
  },
  "address": {
    "type": "[Function]",
    "trim": true
  },
  "organizationId": {
    "type": "[Function]",
    "ref": "Organization",
    "required": true
  },
  "schoolId": {
    "type": "[Function]",
    "required": true,
    "unique": true
  },
  "settings": {
    "type": "[Function]"
  },
  "createdBy": {
    "type": "[Function]",
    "ref": "User"
  },
  "updatedBy": {
    "type": "[Function]",
    "ref": "User"
  },
  "isDeleted": {
    "type": "[Function]",
    "default": false
  },
  "deletedAt": {
    "type": "[Function]"
  },
  "deletedBy": {
    "type": "[Function]",
    "ref": "User"
  }
}
```

### Indexes
- `[{"schoolId":1},{"unique":true,"background":true}]`
- `[{"organizationId":1,"schoolId":1},{"unique":true,"background":true}]`
- `[{"name":"text"},{"background":true}]`

### Relationships
- undefined.organizationId -> Organization
- undefined.createdBy -> User
- undefined.updatedBy -> User
- undefined.deletedBy -> User

### Virtual Fields
- id


### Instance Methods
- initializeTimestamps()




---

## User Collection

**File**: `/src/domain/models/school/user.model.js`

### Schema Definition
```javascript
{
  "email": {
    "type": "[Function]",
    "required": true,
    "unique": true,
    "lowercase": true,
    "trim": true
  },
  "password": {
    "type": "[Function]",
    "required": true,
    "select": false
  },
  "role": {
    "type": "[Function]",
    "enum": [
      "SUPER_ADMIN",
      "PLATFORM_ADMIN",
      "PLATFORM_SUPPORT",
      "PLATFORM_ANALYST",
      "ORG_OWNER",
      "ORG_ADMIN",
      "ORG_MANAGER",
      "SCHOOL_OWNER",
      "SCHOOL_ADMIN",
      "PRINCIPAL",
      "VICE_PRINCIPAL",
      "ACADEMIC_COORDINATOR",
      "ADMIN_STAFF",
      "HEAD_OF_DEPARTMENT",
      "SENIOR_TEACHER",
      "TEACHER",
      "SUBSTITUTE_TEACHER",
      "TEACHING_ASSISTANT",
      "LIBRARIAN",
      "LAB_ASSISTANT",
      "STUDENT",
      "HEAD_BOY",
      "HEAD_GIRL",
      "PREFECT",
      "MONITOR",
      "PARENT",
      "GUARDIAN",
      "EMERGENCY_CONTACT",
      "ACCOUNTANT",
      "CLERK",
      "RECEPTIONIST",
      "SECURITY",
      "TRANSPORT_MANAGER",
      "DRIVER",
      "MAINTENANCE",
      "NURSE"
    ],
    "required": true
  },
  "status": {
    "type": "[Function]",
    "enum": [
      "active",
      "inactive",
      "pending",
      "suspended",
      "deleted"
    ],
    "default": "pending"
  },
  "organizationId": {
    "type": "[Function]",
    "ref": "Organization",
    "required": true
  },
  "schoolId": {
    "type": "[Function]",
    "ref": "School",
    "required": true
  },
  "permissions": [
    {
      "type": "[Function]"
    }
  ],
  "createdBy": {
    "type": "[Function]",
    "ref": "User"
  },
  "updatedBy": {
    "type": "[Function]",
    "ref": "User"
  },
  "isDeleted": {
    "type": "[Function]",
    "default": false
  },
  "deletedAt": {
    "type": "[Function]"
  },
  "deletedBy": {
    "type": "[Function]",
    "ref": "User"
  }
}
```

### Indexes
- `[{"email":1},{"unique":true,"background":true}]`
- `[{"organizationId":1,"schoolId":1,"email":1},{"unique":true,"background":true}]`
- `[{"role":1,"status":1},{"background":true}]`

### Relationships
- undefined.organizationId -> Organization
- undefined.schoolId -> School
- undefined.createdBy -> User
- undefined.updatedBy -> User
- undefined.deletedBy -> User

### Virtual Fields
- id


### Instance Methods
- initializeTimestamps()




---
