// src/domain/enums/roles.enum.js - MISSING FILE CREATED
/**
 * @description User roles enumeration for the School ERP system
 * Defines all available roles across platform, school, and product levels
 */

/**
 * @description Platform-level roles (Super Admin functionality)
 */
export const PLATFORM_ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  PLATFORM_ADMIN: "PLATFORM_ADMIN",
  PLATFORM_SUPPORT: "PLATFORM_SUPPORT",
  PLATFORM_ANALYST: "PLATFORM_ANALYST",
};

/**
 * @description Organization-level roles
 */
export const ORGANIZATION_ROLES = {
  ORG_OWNER: "ORG_OWNER",
  ORG_ADMIN: "ORG_ADMIN",
  ORG_MANAGER: "ORG_MANAGER",
};

/**
 * @description School-level administrative roles
 */
export const SCHOOL_ADMIN_ROLES = {
  SCHOOL_OWNER: "SCHOOL_OWNER",
  SCHOOL_ADMIN: "SCHOOL_ADMIN",
  PRINCIPAL: "PRINCIPAL",
  VICE_PRINCIPAL: "VICE_PRINCIPAL",
  ACADEMIC_COORDINATOR: "ACADEMIC_COORDINATOR",
  ADMIN_STAFF: "ADMIN_STAFF",
};

/**
 * @description Academic roles
 */
export const ACADEMIC_ROLES = {
  HEAD_OF_DEPARTMENT: "HEAD_OF_DEPARTMENT",
  SENIOR_TEACHER: "SENIOR_TEACHER",
  TEACHER: "TEACHER",
  SUBSTITUTE_TEACHER: "SUBSTITUTE_TEACHER",
  TEACHING_ASSISTANT: "TEACHING_ASSISTANT",
  LIBRARIAN: "LIBRARIAN",
  LAB_ASSISTANT: "LAB_ASSISTANT",
};

/**
 * @description Student roles
 */
export const STUDENT_ROLES = {
  STUDENT: "STUDENT",
  HEAD_BOY: "HEAD_BOY",
  HEAD_GIRL: "HEAD_GIRL",
  PREFECT: "PREFECT",
  MONITOR: "MONITOR",
};

/**
 * @description Parent/Guardian roles
 */
export const PARENT_ROLES = {
  PARENT: "PARENT",
  GUARDIAN: "GUARDIAN",
  EMERGENCY_CONTACT: "EMERGENCY_CONTACT",
};

/**
 * @description Support staff roles
 */
export const SUPPORT_ROLES = {
  ACCOUNTANT: "ACCOUNTANT",
  CLERK: "CLERK",
  RECEPTIONIST: "RECEPTIONIST",
  SECURITY: "SECURITY",
  TRANSPORT_MANAGER: "TRANSPORT_MANAGER",
  DRIVER: "DRIVER",
  MAINTENANCE: "MAINTENANCE",
  NURSE: "NURSE",
};

/**
 * @description Combined roles object for easy access
 */
const ROLES = {
  // Platform roles
  ...PLATFORM_ROLES,

  // Organization roles
  ...ORGANIZATION_ROLES,

  // School admin roles
  ...SCHOOL_ADMIN_ROLES,

  // Academic roles
  ...ACADEMIC_ROLES,

  // Student roles
  ...STUDENT_ROLES,

  // Parent roles
  ...PARENT_ROLES,

  // Support roles
  ...SUPPORT_ROLES,
};

/**
 * @description Role hierarchies for permission checking
 */
export const ROLE_HIERARCHIES = {
  PLATFORM: [
    PLATFORM_ROLES.SUPER_ADMIN,
    PLATFORM_ROLES.PLATFORM_ADMIN,
    PLATFORM_ROLES.PLATFORM_SUPPORT,
    PLATFORM_ROLES.PLATFORM_ANALYST,
  ],

  ORGANIZATION: [
    ORGANIZATION_ROLES.ORG_OWNER,
    ORGANIZATION_ROLES.ORG_ADMIN,
    ORGANIZATION_ROLES.ORG_MANAGER,
  ],

  SCHOOL_MANAGEMENT: [
    SCHOOL_ADMIN_ROLES.SCHOOL_OWNER,
    SCHOOL_ADMIN_ROLES.SCHOOL_ADMIN,
    SCHOOL_ADMIN_ROLES.PRINCIPAL,
    SCHOOL_ADMIN_ROLES.VICE_PRINCIPAL,
    SCHOOL_ADMIN_ROLES.ACADEMIC_COORDINATOR,
    SCHOOL_ADMIN_ROLES.ADMIN_STAFF,
  ],

  ACADEMIC_STAFF: [
    ACADEMIC_ROLES.HEAD_OF_DEPARTMENT,
    ACADEMIC_ROLES.SENIOR_TEACHER,
    ACADEMIC_ROLES.TEACHER,
    ACADEMIC_ROLES.SUBSTITUTE_TEACHER,
    ACADEMIC_ROLES.TEACHING_ASSISTANT,
  ],

  STUDENTS: [
    STUDENT_ROLES.HEAD_BOY,
    STUDENT_ROLES.HEAD_GIRL,
    STUDENT_ROLES.PREFECT,
    STUDENT_ROLES.MONITOR,
    STUDENT_ROLES.STUDENT,
  ],

  PARENTS: [
    PARENT_ROLES.PARENT,
    PARENT_ROLES.GUARDIAN,
    PARENT_ROLES.EMERGENCY_CONTACT,
  ],

  SUPPORT_STAFF: [
    SUPPORT_ROLES.ACCOUNTANT,
    SUPPORT_ROLES.CLERK,
    SUPPORT_ROLES.RECEPTIONIST,
    SUPPORT_ROLES.SECURITY,
    SUPPORT_ROLES.TRANSPORT_MANAGER,
    SUPPORT_ROLES.DRIVER,
    SUPPORT_ROLES.MAINTENANCE,
    SUPPORT_ROLES.NURSE,
  ],
};

/**
 * @description Role permissions mapping
 */
export const ROLE_PERMISSIONS = {
  // Platform roles have all permissions
  [PLATFORM_ROLES.SUPER_ADMIN]: ["*"],
  [PLATFORM_ROLES.PLATFORM_ADMIN]: [
    "platform:read",
    "platform:write",
    "platform:delete",
    "organization:read",
    "organization:write",
    "organization:delete",
    "school:read",
    "school:write",
    "school:delete",
    "user:read",
    "user:write",
    "user:delete",
  ],

  // Organization roles
  [ORGANIZATION_ROLES.ORG_OWNER]: [
    "organization:read",
    "organization:write",
    "organization:delete",
    "school:read",
    "school:write",
    "school:delete",
    "user:read",
    "user:write",
  ],

  [ORGANIZATION_ROLES.ORG_ADMIN]: [
    "organization:read",
    "organization:write",
    "school:read",
    "school:write",
    "user:read",
    "user:write",
  ],

  // School admin roles
  [SCHOOL_ADMIN_ROLES.SCHOOL_OWNER]: [
    "school:read",
    "school:write",
    "school:delete",
    "user:read",
    "user:write",
    "user:delete",
    "academic:read",
    "academic:write",
    "finance:read",
    "finance:write",
    "hr:read",
    "hr:write",
  ],

  [SCHOOL_ADMIN_ROLES.PRINCIPAL]: [
    "school:read",
    "school:write",
    "user:read",
    "user:write",
    "academic:read",
    "academic:write",
    "finance:read",
    "finance:write",
    "hr:read",
    "hr:write",
  ],

  // Academic roles
  [ACADEMIC_ROLES.TEACHER]: [
    "academic:read",
    "academic:write",
    "student:read",
    "student:write",
    "attendance:read",
    "attendance:write",
    "grade:read",
    "grade:write",
  ],

  // Student roles
  [STUDENT_ROLES.STUDENT]: [
    "profile:read",
    "profile:write",
    "assignment:read",
    "assignment:write",
    "grade:read",
    "attendance:read",
  ],

  // Parent roles
  [PARENT_ROLES.PARENT]: [
    "child:read",
    "communication:read",
    "grade:read",
    "attendance:read",
    "fee:read",
    "event:read",
  ],
};

/**
 * @description Get all role values as array
 * @returns {string[]} Array of all role values
 */
export const getAllRoles = () => {
  return Object.values(ROLES);
};

/**
 * @description Get roles by category
 * @param {string} category - Role category
 * @returns {string[]} Array of roles in category
 */
export const getRolesByCategory = (category) => {
  const categoryMap = {
    platform: PLATFORM_ROLES,
    organization: ORGANIZATION_ROLES,
    schoolAdmin: SCHOOL_ADMIN_ROLES,
    academic: ACADEMIC_ROLES,
    student: STUDENT_ROLES,
    parent: PARENT_ROLES,
    support: SUPPORT_ROLES,
  };

  return Object.values(categoryMap[category] || {});
};

/**
 * @description Check if role is valid
 * @param {string} role - Role to validate
 * @returns {boolean} True if role is valid
 */
export const isValidRole = (role) => {
  return Object.values(ROLES).includes(role);
};

/**
 * @description Get role hierarchy level (higher number = more privileges)
 * @param {string} role - Role to check
 * @returns {number} Hierarchy level (0-100)
 */
export const getRoleHierarchyLevel = (role) => {
  // Platform roles - highest level
  if (Object.values(PLATFORM_ROLES).includes(role)) {
    const platformRoles = Object.values(PLATFORM_ROLES);
    return 90 + (platformRoles.length - platformRoles.indexOf(role));
  }

  // Organization roles
  if (Object.values(ORGANIZATION_ROLES).includes(role)) {
    const orgRoles = Object.values(ORGANIZATION_ROLES);
    return 80 + (orgRoles.length - orgRoles.indexOf(role));
  }

  // School admin roles
  if (Object.values(SCHOOL_ADMIN_ROLES).includes(role)) {
    const schoolRoles = Object.values(SCHOOL_ADMIN_ROLES);
    return 70 + (schoolRoles.length - schoolRoles.indexOf(role));
  }

  // Academic roles
  if (Object.values(ACADEMIC_ROLES).includes(role)) {
    const academicRoles = Object.values(ACADEMIC_ROLES);
    return 60 + (academicRoles.length - academicRoles.indexOf(role));
  }

  // Support roles
  if (Object.values(SUPPORT_ROLES).includes(role)) {
    return 40;
  }

  // Parent roles
  if (Object.values(PARENT_ROLES).includes(role)) {
    return 30;
  }

  // Student roles
  if (Object.values(STUDENT_ROLES).includes(role)) {
    const studentRoles = Object.values(STUDENT_ROLES);
    return 10 + (studentRoles.length - studentRoles.indexOf(role));
  }

  return 0; // Unknown role
};

/**
 * @description Check if role has higher privilege than another
 * @param {string} role1 - First role
 * @param {string} role2 - Second role
 * @returns {boolean} True if role1 has higher privilege
 */
export const hasHigherPrivilege = (role1, role2) => {
  return getRoleHierarchyLevel(role1) > getRoleHierarchyLevel(role2);
};

/**
 * @description Get permissions for role
 * @param {string} role - Role to get permissions for
 * @returns {string[]} Array of permissions
 */
export const getRolePermissions = (role) => {
  return ROLE_PERMISSIONS[role] || [];
};

/**
 * @description Check if role has permission
 * @param {string} role - Role to check
 * @param {string} permission - Permission to check
 * @returns {boolean} True if role has permission
 */
export const hasPermission = (role, permission) => {
  const permissions = getRolePermissions(role);
  return permissions.includes("*") || permissions.includes(permission);
};

// Default export
export default ROLES;
