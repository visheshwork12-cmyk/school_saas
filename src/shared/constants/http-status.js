// src/shared/constants/http-status.js - MISSING FILE CREATED
/**
 * @description HTTP status codes constants for the School ERP system
 * Based on RFC 7231 and common web standards
 */

/**
 * @description 1xx Informational responses
 */
export const INFORMATIONAL = {
  CONTINUE: 100,
  SWITCHING_PROTOCOLS: 101,
  PROCESSING: 102,
  EARLY_HINTS: 103
};

/**
 * @description 2xx Success responses
 */
export const SUCCESS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NON_AUTHORITATIVE_INFORMATION: 203,
  NO_CONTENT: 204,
  RESET_CONTENT: 205,
  PARTIAL_CONTENT: 206,
  MULTI_STATUS: 207,
  ALREADY_REPORTED: 208,
  IM_USED: 226
};

/**
 * @description 3xx Redirection messages
 */
export const REDIRECTION = {
  MULTIPLE_CHOICES: 300,
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  SEE_OTHER: 303,
  NOT_MODIFIED: 304,
  USE_PROXY: 305,
  TEMPORARY_REDIRECT: 307,
  PERMANENT_REDIRECT: 308
};

/**
 * @description 4xx Client error responses
 */
export const CLIENT_ERROR = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  PROXY_AUTHENTICATION_REQUIRED: 407,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  LENGTH_REQUIRED: 411,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  URI_TOO_LONG: 414,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RANGE_NOT_SATISFIABLE: 416,
  EXPECTATION_FAILED: 417,
  IM_A_TEAPOT: 418,
  MISDIRECTED_REQUEST: 421,
  UNPROCESSABLE_ENTITY: 422,
  LOCKED: 423,
  FAILED_DEPENDENCY: 424,
  TOO_EARLY: 425,
  UPGRADE_REQUIRED: 426,
  PRECONDITION_REQUIRED: 428,
  TOO_MANY_REQUESTS: 429,
  REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
  UNAVAILABLE_FOR_LEGAL_REASONS: 451
};

/**
 * @description 5xx Server error responses
 */
export const SERVER_ERROR = {
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  HTTP_VERSION_NOT_SUPPORTED: 505,
  VARIANT_ALSO_NEGOTIATES: 506,
  INSUFFICIENT_STORAGE: 507,
  LOOP_DETECTED: 508,
  NOT_EXTENDED: 510,
  NETWORK_AUTHENTICATION_REQUIRED: 511
};

/**
 * @description Combined HTTP status codes for easy access
 */
const HTTP_STATUS = {
  // Informational
  ...INFORMATIONAL,
  
  // Success
  ...SUCCESS,
  
  // Redirection
  ...REDIRECTION,
  
  // Client Error
  ...CLIENT_ERROR,
  
  // Server Error
  ...SERVER_ERROR
};

/**
 * @description Common status code groups for quick checks
 */
export const STATUS_GROUPS = {
  INFORMATIONAL: Object.values(INFORMATIONAL),
  SUCCESS: Object.values(SUCCESS),
  REDIRECTION: Object.values(REDIRECTION),
  CLIENT_ERROR: Object.values(CLIENT_ERROR),
  SERVER_ERROR: Object.values(SERVER_ERROR)
};

/**
 * @description Status code descriptions
 */
export const STATUS_DESCRIPTIONS = {
  // 1xx
  100: 'Continue',
  101: 'Switching Protocols',
  102: 'Processing',
  103: 'Early Hints',
  
  // 2xx
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  203: 'Non-Authoritative Information',
  204: 'No Content',
  205: 'Reset Content',
  206: 'Partial Content',
  207: 'Multi-Status',
  208: 'Already Reported',
  226: 'IM Used',
  
  // 3xx
  300: 'Multiple Choices',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  304: 'Not Modified',
  305: 'Use Proxy',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  
  // 4xx
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  407: 'Proxy Authentication Required',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  412: 'Precondition Failed',
  413: 'Payload Too Large',
  414: 'URI Too Long',
  415: 'Unsupported Media Type',
  416: 'Range Not Satisfiable',
  417: 'Expectation Failed',
  418: 'I\'m a Teapot',
  421: 'Misdirected Request',
  422: 'Unprocessable Entity',
  423: 'Locked',
  424: 'Failed Dependency',
  425: 'Too Early',
  426: 'Upgrade Required',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  431: 'Request Header Fields Too Large',
  451: 'Unavailable For Legal Reasons',
  
  // 5xx
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  505: 'HTTP Version Not Supported',
  506: 'Variant Also Negotiates',
  507: 'Insufficient Storage',
  508: 'Loop Detected',
  510: 'Not Extended',
  511: 'Network Authentication Required'
};

/**
 * @description Utility functions for status code checking
 */
export const StatusUtils = {
  /**
   * @description Check if status code is informational (1xx)
   * @param {number} statusCode - Status code to check
   * @returns {boolean} True if informational
   */
  isInformational: (statusCode) => statusCode >= 100 && statusCode < 200,
  
  /**
   * @description Check if status code is success (2xx)
   * @param {number} statusCode - Status code to check
   * @returns {boolean} True if success
   */
  isSuccess: (statusCode) => statusCode >= 200 && statusCode < 300,
  
  /**
   * @description Check if status code is redirection (3xx)
   * @param {number} statusCode - Status code to check
   * @returns {boolean} True if redirection
   */
  isRedirection: (statusCode) => statusCode >= 300 && statusCode < 400,
  
  /**
   * @description Check if status code is client error (4xx)
   * @param {number} statusCode - Status code to check
   * @returns {boolean} True if client error
   */
  isClientError: (statusCode) => statusCode >= 400 && statusCode < 500,
  
  /**
   * @description Check if status code is server error (5xx)
   * @param {number} statusCode - Status code to check
   * @returns {boolean} True if server error
   */
  isServerError: (statusCode) => statusCode >= 500 && statusCode < 600,
  
  /**
   * @description Check if status code is error (4xx or 5xx)
   * @param {number} statusCode - Status code to check
   * @returns {boolean} True if error
   */
  isError: (statusCode) => statusCode >= 400,
  
  /**
   * @description Get description for status code
   * @param {number} statusCode - Status code
   * @returns {string} Status description
   */
  getDescription: (statusCode) => STATUS_DESCRIPTIONS[statusCode] || 'Unknown Status',
  
  /**
   * @description Check if status code is valid HTTP status
   * @param {number} statusCode - Status code to validate
   * @returns {boolean} True if valid
   */
  isValid: (statusCode) => {
    return typeof statusCode === 'number' && 
           statusCode >= 100 && 
           statusCode < 600 && 
           Number.isInteger(statusCode);
  }
};

/**
 * @description School ERP specific status codes and their typical use cases
 */
export const SCHOOL_ERP_STATUS_USAGE = {
  // Authentication & Authorization
  AUTHENTICATION_FAILED: CLIENT_ERROR.UNAUTHORIZED, // 401
  ACCESS_FORBIDDEN: CLIENT_ERROR.FORBIDDEN, // 403
  SESSION_EXPIRED: CLIENT_ERROR.UNAUTHORIZED, // 401
  
  // Validation & Input Errors
  VALIDATION_ERROR: CLIENT_ERROR.UNPROCESSABLE_ENTITY, // 422
  INVALID_INPUT: CLIENT_ERROR.BAD_REQUEST, // 400
  MISSING_REQUIRED_FIELDS: CLIENT_ERROR.BAD_REQUEST, // 400
  
  // Resource Management
  RESOURCE_NOT_FOUND: CLIENT_ERROR.NOT_FOUND, // 404
  RESOURCE_CONFLICT: CLIENT_ERROR.CONFLICT, // 409
  RESOURCE_CREATED: SUCCESS.CREATED, // 201
  RESOURCE_UPDATED: SUCCESS.OK, // 200
  RESOURCE_DELETED: SUCCESS.NO_CONTENT, // 204
  
  // Subscription & Billing
  SUBSCRIPTION_EXPIRED: CLIENT_ERROR.PAYMENT_REQUIRED, // 402
  FEATURE_NOT_AVAILABLE: CLIENT_ERROR.FORBIDDEN, // 403
  USAGE_LIMIT_EXCEEDED: CLIENT_ERROR.TOO_MANY_REQUESTS, // 429
  
  // Multi-tenancy
  TENANT_NOT_FOUND: CLIENT_ERROR.NOT_FOUND, // 404
  TENANT_SUSPENDED: CLIENT_ERROR.FORBIDDEN, // 403
  INVALID_TENANT: CLIENT_ERROR.BAD_REQUEST, // 400
  
  // School Operations
  ACADEMIC_YEAR_LOCKED: CLIENT_ERROR.LOCKED, // 423
  ENROLLMENT_FULL: CLIENT_ERROR.CONFLICT, // 409
  GRADE_ALREADY_ASSIGNED: CLIENT_ERROR.CONFLICT, // 409
  
  // System Operations
  MAINTENANCE_MODE: SERVER_ERROR.SERVICE_UNAVAILABLE, // 503
  SYSTEM_OVERLOAD: SERVER_ERROR.SERVICE_UNAVAILABLE, // 503
  DATABASE_ERROR: SERVER_ERROR.INTERNAL_SERVER_ERROR, // 500
  
  // Success Operations
  LOGIN_SUCCESS: SUCCESS.OK, // 200
  LOGOUT_SUCCESS: SUCCESS.OK, // 200
  DATA_EXPORTED: SUCCESS.OK, // 200
  REPORT_GENERATED: SUCCESS.CREATED, // 201
  EMAIL_SENT: SUCCESS.ACCEPTED, // 202
};

/**
 * @description Get status code for specific ERP operation
 * @param {string} operation - Operation name
 * @returns {number} HTTP status code
 */
export const getERPStatus = (operation) => {
  return SCHOOL_ERP_STATUS_USAGE[operation] || HTTP_STATUS.INTERNAL_SERVER_ERROR;
};

/**
 * @description Create response object with status and message
 * @param {number} statusCode - HTTP status code
 * @param {string} [message] - Custom message
 * @param {any} [data] - Response data
 * @returns {Object} Response object
 */
export const createResponse = (statusCode, message, data = null) => {
  return {
    statusCode,
    status: StatusUtils.getDescription(statusCode),
    success: StatusUtils.isSuccess(statusCode),
    message: message || StatusUtils.getDescription(statusCode),
    data,
    timestamp: new Date().toISOString()
  };
};

// Default export
export default HTTP_STATUS;