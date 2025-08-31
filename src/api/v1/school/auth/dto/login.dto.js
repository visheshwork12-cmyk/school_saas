import Joi from "joi";
import ROLES from "#domain/enums/roles.enum.js";

/**
 * @description Joi schemas for authentication DTOs.
 *
 * @example
 * const { error } = loginSchema.validate(data);
 */
const loginSchema = Joi.object({
  email: Joi.string().email().required().label("Email"),
  password: Joi.string().min(8).required().label("Password"),
  schoolId: Joi.string().uuid().required().label("School ID"),
  rememberMe: Joi.boolean().optional(),
  deviceInfo: Joi.object({
    browser: Joi.string().optional(),
    os: Joi.string().optional(),
    ip: Joi.string().optional(),
  }).optional(),
});

const registerSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).required().label("First Name"),
  lastName: Joi.string().min(2).max(50).required().label("Last Name"),
  email: Joi.string().email().required().label("Email"),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .required()
    .label("Password"),
  role: Joi.string()
    .valid(...Object.values(ROLES))
    .required()
    .label("Role"),
  schoolId: Joi.string().uuid().required().label("School ID"),
  departmentId: Joi.string().uuid().optional().label("Department ID"),
});

// Add more schemas: forgotPasswordSchema, etc.

export { loginSchema, registerSchema };
