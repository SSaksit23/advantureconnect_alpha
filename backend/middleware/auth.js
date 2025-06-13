// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const pool = require('../models/database');
const winston = require('winston');
const env = require('../config/env'); // Centralised environment variables
const { isBlacklisted } = require('../services/redisService'); // Redis token blacklist checker

// Configure logger for this middleware
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'auth-middleware' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
    // Removed file transports to avoid logs directory issues
  ]
});

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (token == null) {
    logger.warn('Authentication token required but not provided.', { path: req.path });
    return res.status(401).json({ 
      success: false,
      message: 'Authentication token required.' 
    });
  }

  // ----- Redis Blacklist Check -----
  try {
    const blacklisted = await isBlacklisted(token);
    if (blacklisted) {
      logger.warn('Blacklisted token intercepted. Access denied.', { path: req.path });
      return res.status(401).json({
        success: false,
        message: 'Token has been revoked. Please log in again.'
      });
    }
  } catch (err) {
    // Fail-open strategy already implemented in isBlacklisted, but log here as well
    logger.error('Error while checking token blacklist status.', { error: err.message, path: req.path });
  }

  try {
    // env.JWT_SECRET is validated at application startup – no insecure fallback
    const decoded = jwt.verify(token, env.JWT_SECRET);
    
    // Get user from database
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      logger.warn(`User not found for token. User ID: ${decoded.userId}`, { path: req.path });
      return res.status(403).json({ 
        success: false,
        message: 'User not found for this token.' 
      });
    }
    
    const user = result.rows[0];
    
    // Check if user is active
    if (!user.is_active) {
      logger.warn(`Inactive user attempted access. User ID: ${user.id}`, { path: req.path });
      return res.status(403).json({ 
        success: false,
        message: 'Account is deactivated.' 
      });
    }
    
    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name
    };
    
    logger.info(`User authenticated: ${user.email} (ID: ${user.id})`, { path: req.path });
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      logger.warn('Token expired.', { error: err.message, path: req.path });
      return res.status(401).json({ 
        success: false,
        message: 'Token expired. Please log in again.' 
      });
    }
    if (err.name === 'JsonWebTokenError') {
      logger.warn('Invalid token.', { error: err.message, path: req.path });
      return res.status(403).json({ 
        success: false,
        message: 'Invalid token.' 
      });
    }
    logger.error("Token verification failed.", { error: err.message, stack: err.stack, path: req.path });
    return res.status(403).json({ 
      success: false,
      message: 'Token verification failed.' 
    });
  }
};

// Simplified authentication middleware for basic tour operator system
// Additional role-based middleware can be added later as needed

module.exports = {
  authenticateToken
};
