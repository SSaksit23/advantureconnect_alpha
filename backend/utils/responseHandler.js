// backend/utils/responseHandler.js
const winston = require('winston');
const env = require('../config/env'); // For consistent logger configuration

// Configure logger for this utility
const logger = winston.createLogger({
  level: env.getEnv('LOG_LEVEL', 'info'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }), // Log stack traces for errors
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'response-handler' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    // Add file transports if needed for production, e.g.:
    // new winston.transports.File({ filename: 'logs/response-error.log', level: 'error' }),
  ],
});

/**
 * Custom error class for application-specific errors.
 * Allows specifying a status code and operational flag.
 */
class AppError extends Error {
  /**
   * Creates an instance of AppError.
   * @param {string} message - The error message.
   * @param {number} statusCode - The HTTP status code.
   * @param {boolean} [isOperational=true] - Flag indicating if it's an operational error (known, expected).
   * @param {Array|object} [errors=null] - Optional detailed error information (e.g., validation errors).
   */
  constructor(message, statusCode, isOperational = true, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors; // For detailed validation errors or other structured error info
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error'; // For consistency with some error handling patterns

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Sends a standardized success response.
 * @param {import('express').Response} res - The Express response object.
 * @param {number} statusCode - The HTTP status code.
 * @param {string} message - A descriptive message for the success.
 * @param {object} [data=null] - The payload/data to send.
 * @param {object} [meta=null] - Optional metadata (e.g., pagination info).
 */
const successResponse = (res, statusCode, message, data = null, meta = null) => {
  const responsePayload = {
    success: true,
    message,
  };
  if (data !== null) {
    responsePayload.data = data;
  }
  if (meta !== null) {
    responsePayload.meta = meta;
  }
  res.status(statusCode).json(responsePayload);
};

/**
 * Sends a standardized error response.
 * @param {import('express').Response} res - The Express response object.
 * @param {number} statusCode - The HTTP status code.
 * @param {string} message - A descriptive error message.
 * @param {Array|object} [errors=null] - Optional detailed error information (e.g., validation errors array or a single error object).
 */
const errorResponse = (res, statusCode, message, errors = null) => {
  const responsePayload = {
    success: false,
    message,
  };
  if (errors) {
    // If `errors` is an array (like Joi validation details) or a structured object
    if (Array.isArray(errors) || (typeof errors === 'object' && errors !== null)) {
      responsePayload.errors = errors;
    } else {
      // If it's a simple string or other primitive, wrap it for consistency
      responsePayload.error = { detail: String(errors) };
    }
  }
  res.status(statusCode).json(responsePayload);
};

/**
 * Centralized error handling middleware or utility function.
 * Interprets various error types and sends a standardized error response.
 *
 * @param {import('express').Response} res - The Express response object.
 * @param {Error|AppError} error - The error object.
 * @param {string} [defaultMessage='An unexpected error occurred.'] - Default message if error message is not specific.
 */
const handleError = (res, error, defaultMessage = 'An unexpected error occurred.') => {
  // Log the error internally, especially if it's not an operational AppError
  if (!(error instanceof AppError) || !error.isOperational || error.statusCode >= 500) {
    logger.error('Unhandled or Server Error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code, // For DB errors etc.
      details: error.details, // For Joi errors
      ...(error instanceof AppError && { appErrorDetails: error.errors }),
    });
  } else if (env.env === 'development') { // Log operational errors in dev for easier debugging
    logger.warn('Operational Error:', {
        message: error.message,
        statusCode: error.statusCode,
        details: error.errors,
    });
  }


  if (error instanceof AppError) {
    return errorResponse(res, error.statusCode, error.message, error.errors);
  }

  if (error.isJoi) { // Joi validation error
    const validationErrors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      type: detail.type,
    }));
    return errorResponse(res, 400, 'Validation failed. Please check your input.', validationErrors);
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    return errorResponse(res, 401, 'Invalid token. Please log in again.');
  }
  if (error.name === 'TokenExpiredError') {
    return errorResponse(res, 401, 'Token expired. Please log in again.');
  }

  // Handle PostgreSQL unique constraint violation (example)
  if (error.code === '23505') { // PostgreSQL unique_violation error code
    // Try to extract a user-friendly message if possible, e.g., from error.constraint
    const field = error.constraint ? error.constraint.split('_').pop() : 'related field';
    return errorResponse(res, 409, `A record with this ${field} already exists. Please use a different value.`);
  }
  
  // Handle other specific database errors by code if needed
  // e.g., error.code === '23503' for foreign key violation

  // Default to 500 Internal Server Error for unhandled errors
  // In production, you might not want to send the raw error.message
  const messageToSend = (env.env === 'production' && !(error instanceof AppError && error.isOperational))
    ? defaultMessage
    : error.message || defaultMessage;

  return errorResponse(res, 500, messageToSend);
};

module.exports = {
  AppError,
  successResponse,
  errorResponse,
  handleError,
};
