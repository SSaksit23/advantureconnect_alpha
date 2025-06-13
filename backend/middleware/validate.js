// backend/middleware/validate.js
const Joi = require('joi');
const winston = require('winston');
const env = require('../config/env'); // For consistent logger configuration

// Configure logger for this middleware
const logger = winston.createLogger({
  level: env.getEnv('LOG_LEVEL', 'info'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'validation-middleware' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
    // Add file transports if needed, e.g.:
    // new winston.transports.File({ filename: 'logs/validation-error.log', level: 'error' }),
  ]
});

/**
 * Joi validation options.
 * - abortEarly: false - Collect all errors, not just the first one.
 * - stripUnknown: true - Remove properties not defined in the schema. This acts as a basic sanitization step.
 * - convert: true - Attempt to convert types (e.g., string "123" to number 123) if specified in schema.
 */
const defaultJoiOptions = {
  abortEarly: false,
  stripUnknown: true,
  convert: true,
};

/**
 * Middleware factory for validating request data (body, query, params) using Joi schemas.
 *
 * @param {object} schemas - An object containing Joi schemas for different parts of the request.
 * @param {Joi.Schema} [schemas.body] - Joi schema for validating `req.body`.
 * @param {Joi.Schema} [schemas.query] - Joi schema for validating `req.query`.
 * @param {Joi.Schema} [schemas.params] - Joi schema for validating `req.params`.
 * @param {object} [joiOptions=defaultJoiOptions] - Optional Joi validation options to override defaults.
 *
 * @returns {function} Express middleware function.
 *
 * @example
 * // ---- In your routes file (e.g., backend/routes/someRoute.js) ----
 * const express = require('express');
 * const router = express.Router();
 * const Joi = require('joi');
 * const validate = require('../middleware/validate'); // Assuming this file is in middleware directory
 *
 * // Define a schema for creating a new item
 * const createItemSchema = {
 *   body: Joi.object({
 *     name: Joi.string().trim().min(3).max(100).required()
 *       .messages({
 *         'string.base': `"name" should be a type of 'text'`,
 *         'string.empty': `"name" cannot be an empty field`,
 *         'string.min': `"name" should have a minimum length of {#limit}`,
 *         'string.max': `"name" should have a maximum length of {#limit}`,
 *         'any.required': `"name" is a required field`
 *       }),
 *     description: Joi.string().trim().optional().allow('').max(500),
 *     quantity: Joi.number().integer().min(1).default(1),
 *     tags: Joi.array().items(Joi.string().trim().lowercase()).optional(),
 *     // Example of sanitization: Joi.string().escapeHTML() - requires joi-extension-escape-html or similar
 *   }),
 *   query: Joi.object({
 *     source: Joi.string().alphanum().optional()
 *   }),
 *   params: Joi.object({
 *      categoryId: Joi.string().guid({ version: 'uuidv4' }).required()
 *   })
 * };
 *
 * // Apply the validation middleware to a route
 * // router.post('/items/:categoryId', validate(createItemSchema), (req, res) => {
 * //   // If validation passes, req.body, req.query, req.params will contain validated and potentially transformed data.
 * //   // req.body.name will be trimmed.
 * //   // req.body.quantity will be an integer, defaulting to 1 if not provided.
 * //   // req.body.tags items will be trimmed and lowercased.
 * //   // Unknown properties in req.body will be stripped.
 * //   res.status(201).json({ message: 'Item created successfully', data: req.body, query: req.query, params: req.params });
 * // });
 * //
 * // module.exports = router;
 */
const validate = (schemas, joiOptions = {}) => {
  const effectiveJoiOptions = { ...defaultJoiOptions, ...joiOptions };

  return async (req, res, next) => {
    const validationTargets = [
      { key: 'body', schema: schemas.body, data: req.body },
      { key: 'query', schema: schemas.query, data: req.query },
      { key: 'params', schema: schemas.params, data: req.params },
    ];

    const allErrors = [];

    for (const target of validationTargets) {
      if (target.schema) {
        try {
          // Validate the data
          const validatedData = await target.schema.validateAsync(target.data, effectiveJoiOptions);
          // Replace original request data with validated (and potentially transformed/sanitized) data
          req[target.key] = validatedData;
        } catch (validationError) {
          if (validationError.isJoi) {
            const formattedErrors = validationError.details.map(detail => ({
              field: detail.path.join('.'),
              message: detail.message,
              type: detail.type,
            }));
            allErrors.push(...formattedErrors);
          } else {
            // Should not happen if using Joi, but as a fallback
            allErrors.push({
              field: target.key,
              message: `Invalid data in request ${target.key}.`,
              type: 'internal.error',
            });
            logger.error(`Non-Joi validation error for ${target.key}:`, validationError);
          }
        }
      }
    }

    if (allErrors.length > 0) {
      logger.warn(`Validation failed for ${req.method} ${req.originalUrl}`, {
        errors: allErrors,
        ip: req.ip,
        body: req.body, // Log original body for debugging
        query: req.query,
        params: req.params
      });
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Please check your input.',
        errors: allErrors,
      });
    }

    // If all validations pass
    next();
  };
};

module.exports = validate;

/**
 * ---- Notes on Sanitization ----
 *
 * 1. Joi's Built-in Transformations:
 *    - `trim()`: Removes whitespace from the beginning and end of a string.
 *    - `lowercase()` / `uppercase()`: Converts string to specified case.
 *    - `default(value)`: Provides a default value if one isn't provided.
 *    - Type Conversions: Joi can convert strings to numbers, booleans, dates if `convert: true` (default)
 *      and the schema specifies the target type (e.g., `Joi.number()`).
 *    - `stripUnknown: true` (in joiOptions): This is a powerful sanitization feature as it removes
 *      any properties from the validated object that are not explicitly defined in the schema.
 *      This helps prevent mass assignment vulnerabilities.
 *
 * 2. Escaping HTML/Script Content:
 *    - For preventing XSS by escaping HTML characters (e.g., converting `<` to `&lt;`),
 *      Joi itself does not have a built-in `escapeHTML()` method.
 *    - You would typically use a Joi extension like `joi-custom-helpers` or `joi-extension-string`
 *      or integrate a dedicated sanitization library.
 *    - Example using a hypothetical extension:
 *      `description: Joi.string().trim().escapeHTML().max(500)`
 *    - Alternatively, sanitization for XSS can be handled separately before saving to the database
 *      or, more commonly, upon rendering data back to the client (output encoding).
 *
 * 3. Other Sanitization Libraries:
 *    - `express-validator`: Provides a rich set of validators and sanitizers that can be chained.
 *      It's a popular choice for Express.js applications.
 *    - `sanitize-html`: Specifically designed for stripping unwanted HTML and preventing XSS.
 *    - `DOMPurify`: Client-side and Node.js library for HTML sanitization.
 *
 * 4. Where to Sanitize:
 *    - Input Validation (this middleware): Good for basic sanitization like trimming, case conversion,
 *      stripping unknown fields, and ensuring data types.
 *    - Before Database Storage: For data that needs to be stored in a specific "clean" format, or
 *      if you need to remove potentially harmful constructs that are not just about XSS.
 *    - Output Encoding (Before Rendering to User): This is the most critical place to prevent XSS.
 *      Always encode data appropriately for the context in which it's being displayed (HTML, JS, CSS).
 *      Templating engines (like EJS, Pug, Handlebars) often do this by default. React also auto-escapes.
 *
 * This `validate.js` middleware focuses on Joi's capabilities for validation and basic transformation/sanitization.
 * For more advanced sanitization (like robust XSS protection), consider dedicated libraries or output encoding.
 */
