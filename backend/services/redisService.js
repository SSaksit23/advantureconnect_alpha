// backend/services/redisService.js
const winston = require('winston');
const { redisClient } = require('../models/database'); // Assumes redisClient is properly exported after connection
const env = require('../config/env');

const logger = winston.createLogger({
  level: env.getEnv('LOG_LEVEL', 'info'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'redis-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    // Add file transports if needed, e.g.:
    // new winston.transports.File({ filename: 'logs/redis-error.log', level: 'error' }),
    // new winston.transports.File({ filename: 'logs/redis.log' }),
  ],
});

const BLACKLIST_PREFIX = 'blacklist:jwt:';

/**
 * Parses a time string (e.g., "24h", "30m", "7d") into seconds.
 * @param {string | number} timeStr - The time string or number in seconds.
 * @returns {number} Time in seconds. Defaults to 24 hours if parsing fails.
 */
function parseExpiryToSeconds(timeStr) {
  const defaultExpirySeconds = 24 * 60 * 60; // 24 hours

  if (typeof timeStr === 'number') {
    return timeStr > 0 ? timeStr : defaultExpirySeconds;
  }

  if (typeof timeStr !== 'string' || !timeStr) {
    logger.warn(`Invalid timeStr for parseExpiryToSeconds: ${timeStr}. Defaulting to ${defaultExpirySeconds}s.`);
    return defaultExpirySeconds;
  }

  const unit = timeStr.charAt(timeStr.length - 1).toLowerCase();
  const value = parseInt(timeStr.slice(0, -1), 10);

  if (isNaN(value) || value <= 0) {
    logger.warn(`Invalid value in timeStr for parseExpiryToSeconds: ${timeStr}. Defaulting to ${defaultExpirySeconds}s.`);
    return defaultExpirySeconds;
  }

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 24 * 60 * 60;
    default:
      logger.warn(`Unknown unit in timeStr for parseExpiryToSeconds: ${timeStr}. Defaulting to ${defaultExpirySeconds}s.`);
      return defaultExpirySeconds;
  }
}

/**
 * Adds a JWT to the Redis blacklist.
 * The token will be stored in Redis with a TTL corresponding to its original max lifespan.
 * @param {string} token - The JWT to blacklist.
 * @returns {Promise<boolean>} True if successfully blacklisted, false otherwise.
 */
async function addToBlacklist(token) {
  if (!token) {
    logger.warn('Attempted to blacklist an empty token.');
    return false;
  }

  if (!redisClient || !redisClient.isOpen) {
    logger.error('Redis client is not connected or available. Cannot add token to blacklist.');
    // In a critical scenario, you might want to throw an error to ensure the operation doesn't silently fail.
    // For now, returning false indicates failure to the caller.
    return false;
  }

  const key = `${BLACKLIST_PREFIX}${token}`;
  // Use the JWT_EXPIRES_IN from config as the TTL for the blacklist entry.
  // This ensures the blacklist entry doesn't live much longer than the token's original max validity.
  const expirySeconds = parseExpiryToSeconds(env.jwtExpiresIn);

  try {
    // SET key value EX seconds
    await redisClient.set(key, 'blacklisted', { EX: expirySeconds });
    logger.info(`Token successfully added to blacklist with TTL ${expirySeconds}s. Key: ${key.substring(0, BLACKLIST_PREFIX.length + 15)}...`);
    return true;
  } catch (error) {
    logger.error(`Failed to add token to Redis blacklist. Key: ${key.substring(0, BLACKLIST_PREFIX.length + 15)}...`, { errorMessage: error.message, stack: error.stack });
    return false;
  }
}

/**
 * Checks if a JWT is currently in the Redis blacklist.
 * @param {string} token - The JWT to check.
 * @returns {Promise<boolean>} True if the token is blacklisted, false otherwise.
 *                             Returns false also if Redis is unavailable, to prevent locking out users
 *                             due to Redis issues (fail-open strategy for this check).
 */
async function isBlacklisted(token) {
  if (!token) {
    logger.warn('Attempted to check an empty token for blacklist status.');
    return false;
  }

  if (!redisClient || !redisClient.isOpen) {
    logger.error('Redis client is not connected or available. Cannot check blacklist status. Failing open (token not blacklisted).');
    // Fail-open strategy: If Redis is down, assume token is not blacklisted.
    // This prevents users from being locked out if Redis has issues.
    // Log this event carefully for monitoring.
    return false;
  }

  const key = `${BLACKLIST_PREFIX}${token}`;
  try {
    const result = await redisClient.get(key);
    if (result === 'blacklisted') {
      logger.warn(`Attempt to use a blacklisted token. Key: ${key.substring(0, BLACKLIST_PREFIX.length + 15)}...`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error(`Error checking token in Redis blacklist. Key: ${key.substring(0, BLACKLIST_PREFIX.length + 15)}... Failing open.`, { errorMessage: error.message, stack: error.stack });
    // Fail-open on error as well
    return false;
  }
}

module.exports = {
  addToBlacklist,
  isBlacklisted,
  parseExpiryToSeconds, // Exporting for testing or other potential uses
};
