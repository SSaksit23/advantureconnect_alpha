// backend/middleware/errorHandler.js
const { handleError } = require('../utils/responseHandler');
const winston = require('winston'); // For logging if needed directly here, though handleError logs
const env = require('../config/env');

// Configure a logger specific to this middleware if more detailed context is needed
// than what handleError provides. For now, handleError's logging should be sufficient.
const logger = winston.createLogger({
  level: env.getEnv('LOG_LEVEL', 'info'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'global-error-handler' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

/**
 * Global error handling middleware for Express.
 * This middleware should be placed last in the middleware stack.
 * It catches any errors passed via `next(err)` or unhandled promise rejections
 * that are caught by Express's default error handling.
 *
 * It uses the centralized `handleError` utility to process the error and send
 * a standardized JSON response to the client.
 *
 * @param {Error} err - The error object.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The Express next middleware function.
 */
// eslint-disable-next-line no-unused-vars
const globalErrorHandler = (err, req, res, next) => {
  // Log that this global handler was reached, especially if it's an unexpected error
  // The detailed logging of the error itself is done within `handleError`.
  if (res.headersSent) {
    // If headers already sent, delegate to Express default error handler
    // This usually means an error occurred while streaming the response
    logger.error('Error occurred after headers were sent. Delegating to Express default error handler.', {
      originalUrl: req.originalUrl,
      method: req.method,
      errorMessage: err.message,
    });
    return next(err);
  }

  // Use the centralized handleError utility to process and send the response
  // handleError will log the error and send an appropriate JSON response
  handleError(res, err);

  // We don't call next(err) here because handleError is intended to be the
  // final point for sending an error response for this request.
  // If handleError itself had an issue and didn't send a response,
  // the request might hang, but handleError is designed to always send one.
};

module.exports = globalErrorHandler;
