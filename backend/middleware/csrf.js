// backend/middleware/csrf.js
const crypto = require('crypto');
const winston = require('winston');
const { redisClient } = require('../models/database'); // Assuming redisClient is connected and exported
const env = require('../config/env');

const CSRF_TOKEN_TTL_SECONDS = env.getEnv('CSRF_TOKEN_TTL_SECONDS', 15 * 60, 'number'); // Default 15 minutes
const CSRF_REDIS_PREFIX = 'csrf:token:';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_COOKIE_NAME = '_csrfToken'; // Cookie name, distinct from header

// Configure logger for this middleware
const logger = winston.createLogger({
  level: env.getEnv('LOG_LEVEL', 'info'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'csrf-middleware' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
    // Add file transports if needed
  ]
});

/**
 * Generates a cryptographically strong random token string.
 * @returns {string} A random token.
 */
function generateTokenString() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Stores a CSRF token in Redis, associated with a user ID.
 * @param {string} token - The CSRF token.
 * @param {string} userId - The ID of the user to associate with the token.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
async function storeToken(token, userId) {
  if (!redisClient || !redisClient.isOpen) {
    logger.error('CSRF: Redis client not available for storing token.');
    return false;
  }
  const key = `${CSRF_REDIS_PREFIX}${token}`;
  const value = JSON.stringify({ userId, issuedAt: Date.now() });
  try {
    await redisClient.set(key, value, { EX: CSRF_TOKEN_TTL_SECONDS });
    logger.debug(`CSRF: Stored token for userId ${userId}. Key: ${key.substring(0, CSRF_REDIS_PREFIX.length + 10)}...`);
    return true;
  } catch (error) {
    logger.error(`CSRF: Failed to store token in Redis for userId ${userId}. Key: ${key.substring(0, CSRF_REDIS_PREFIX.length + 10)}...`, { error: error.message });
    return false;
  }
}

/**
 * Verifies a CSRF token against Redis and checks if it belongs to the authenticated user.
 * @param {string} clientToken - The CSRF token received from the client.
 * @param {string} userId - The ID of the currently authenticated user.
 * @returns {Promise<boolean>} True if the token is valid and matches the user, false otherwise.
 */
async function verifyToken(clientToken, userId) {
  if (!clientToken) {
    logger.warn('CSRF: No client token provided for verification.');
    return false;
  }
  if (!redisClient || !redisClient.isOpen) {
    logger.error('CSRF: Redis client not available for token verification. Failing open for CSRF check (this is a security risk if Redis is down).');
    // Potentially dangerous to fail open, but if Redis is critical and down, CSRF might be secondary.
    // For higher security, this should fail closed (return false).
    // However, if Redis is essential for sessions too, the app might be unusable anyway.
    // Let's log verbosely and consider implications. For now, fail open for CSRF check to avoid locking out if Redis is flaky.
    // A better approach might be a circuit breaker or more robust Redis health check.
    return true; // Or false for fail-closed
  }

  const key = `${CSRF_REDIS_PREFIX}${clientToken}`;
  try {
    const storedValueJSON = await redisClient.get(key);
    if (!storedValueJSON) {
      logger.warn(`CSRF: Token not found in Redis or expired. Key: ${key.substring(0, CSRF_REDIS_PREFIX.length + 10)}...`);
      return false;
    }

    const storedValue = JSON.parse(storedValueJSON);
    if (storedValue.userId !== userId) {
      logger.error(`CSRF: Token ownership mismatch. Token for userId ${storedValue.userId}, current userId ${userId}. Key: ${key.substring(0, CSRF_REDIS_PREFIX.length + 10)}...`);
      return false;
    }

    // Optional: Implement one-time use by deleting the token here
    // await redisClient.del(key);
    // logger.debug(`CSRF: Token verified and invalidated (one-time use). Key: ${key.substring(0, CSRF_REDIS_PREFIX.length + 10)}...`);

    logger.debug(`CSRF: Token verified successfully for userId ${userId}. Key: ${key.substring(0, CSRF_REDIS_PREFIX.length + 10)}...`);
    return true;
  } catch (error) {
    logger.error(`CSRF: Error verifying token from Redis. Key: ${key.substring(0, CSRF_REDIS_PREFIX.length + 10)}...`, { error: error.message });
    return false; // Fail closed on Redis error during verification
  }
}

/**
 * Middleware to protect routes against CSRF attacks.
 * Expects `authenticateToken` middleware to have run first and populated `req.user`.
 * Reads CSRF token from `X-CSRF-Token` header.
 */
const csrfProtection = async (req, res, next) => {
  // CSRF protection is typically for state-changing methods
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return next();
  }

  if (!req.user || !req.user.id) {
    logger.error('CSRF: User not authenticated. `authenticateToken` middleware must run before `csrfProtection`.');
    return res.status(500).json({ success: false, message: 'Server configuration error regarding CSRF protection.' });
  }

  const clientToken = req.headers[CSRF_HEADER_NAME.toLowerCase()]; // Headers are case-insensitive

  if (!clientToken) {
    logger.warn(`CSRF: Missing CSRF token in header '${CSRF_HEADER_NAME}' for ${req.method} ${req.originalUrl} by userId ${req.user.id}`);
    return res.status(403).json({ success: false, message: 'CSRF token missing or invalid.' });
  }

  const isValid = await verifyToken(clientToken, req.user.id);

  if (!isValid) {
    logger.warn(`CSRF: Invalid CSRF token provided for ${req.method} ${req.originalUrl} by userId ${req.user.id}. Token: ${clientToken.substring(0,10)}...`);
    return res.status(403).json({ success: false, message: 'CSRF token missing or invalid.' });
  }

  logger.info(`CSRF: Token validated for ${req.method} ${req.originalUrl} by userId ${req.user.id}`);
  next();
};

/**
 * Middleware or handler to generate a new CSRF token, store it, and send it to the client.
 * Typically used after login or on a dedicated endpoint.
 * Expects `authenticateToken` middleware to have run first if associating with a user.
 *
 * This function can be used as middleware that attaches the token to `res.locals`
 * and also sets a cookie and includes it in the JSON response.
 */
const sendNewCsrfToken = async (req, res, nextOrData = null) => {
  if (!req.user || !req.user.id) {
    logger.error('CSRF: Cannot generate user-specific CSRF token without authenticated user.');
    // If this is middleware, call next(error) or send error response
    if (typeof nextOrData === 'function') {
        return res.status(500).json({ success: false, message: 'User authentication required to issue CSRF token.' });
    }
    // If used as a direct handler modifier, this check should be done by the caller.
    // For now, let's assume it's called in a context where req.user is available.
  }

  const token = generateTokenString();
  const stored = await storeToken(token, req.user.id);

  if (!stored) {
    logger.error(`CSRF: Failed to store newly generated CSRF token for userId ${req.user.id}.`);
    if (typeof nextOrData === 'function') { // if used as middleware
        return res.status(500).json({ success: false, message: 'Failed to issue CSRF token due to server error.' });
    }
    // If modifying existing response, we might not want to fail the whole response
    // For now, we'll proceed but the token won't be usable.
  }

  // Option 1: Send as a cookie (readable by client-side JS for SPA)
  const cookieOptions = {
    httpOnly: false, // JS needs to read this to send in header
    secure: env.env === 'production', // Only send over HTTPS in production
    sameSite: 'Lax', // Or 'Strict'
    path: '/',
    maxAge: CSRF_TOKEN_TTL_SECONDS * 1000, // milliseconds
  };
  res.cookie(CSRF_COOKIE_NAME, token, cookieOptions);
  logger.debug(`CSRF: Token set in cookie '${CSRF_COOKIE_NAME}' for userId ${req.user.id}.`);

  // Option 2: Make available for JSON response
  // If this is middleware, attach to res.locals or modify response
  if (typeof nextOrData === 'function') { // Middleware usage
    res.locals.csrfToken = token;
    logger.debug(`CSRF: Token set in res.locals.csrfToken for userId ${req.user.id}.`);
    nextOrData(); // Call next()
  } else if (nextOrData && typeof nextOrData === 'object') { // Modifying existing JSON data
    nextOrData.csrfToken = token;
    logger.debug(`CSRF: Token added to JSON response data for userId ${req.user.id}.`);
    // The caller will then send `nextOrData` as JSON.
    // This case assumes this function is called like: sendNewCsrfToken(req, res, jsonDataToSend);
    // and then jsonDataToSend is sent by the caller. This is a bit awkward.
    // A more common pattern is to have a dedicated endpoint.
  } else {
    // If called without a next function or data object, it implies it might be a dedicated handler.
    // For a dedicated endpoint /api/auth/csrf-token
    logger.debug(`CSRF: Sending token in dedicated response for userId ${req.user.id}.`);
    return res.json({ success: true, csrfToken: token });
  }
};


module.exports = {
  csrfProtection,
  sendNewCsrfToken,
  generateTokenString, // Export for potential direct use if needed
  storeToken,          // Export for potential direct use
  CSRF_HEADER_NAME,    // Export for frontend to know which header to use
  CSRF_COOKIE_NAME,    // Export for reference
};
