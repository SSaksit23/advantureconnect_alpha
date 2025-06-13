const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const pool = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const env = require('../config/env'); // Centralised, validated environment variables
const { addToBlacklist } = require('../services/redisService'); // Token blacklist helper
const { sendNewCsrfToken } = require('../middleware/csrf'); // CSRF token helper

const router = express.Router();

// Secure environment variables (validated at startup – no insecure fallbacks)
const JWT_SECRET = env.JWT_SECRET;
const JWT_EXPIRES_IN = env.jwtExpiresIn;

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  firstName: Joi.string().min(2).max(50).required(),
  lastName: Joi.string().min(2).max(50).required(),
  phone: Joi.string().optional(),
  dateOfBirth: Joi.date().optional()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Register new user
router.post('/register', async (req, res) => {
  try {
    // Validate input
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(d => d.message)
      });
    }

    const { email, password, firstName, lastName, phone, dateOfBirth } = value;

    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert user into database
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, date_of_birth) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, email, first_name, last_name, created_at`,
      [email, passwordHash, firstName, lastName, phone, dateOfBirth]
    );

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Generate refresh token (longer expiry)
    const refreshToken = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        type: 'refresh'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: user.created_at
      },
      accessToken: token,
      refreshToken: refreshToken
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during registration'
    });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    // Validate input
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(d => d.message)
      });
    }

    const { email, password } = value;

    // Find user by email
    const result = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name, is_active FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = result.rows[0];

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Generate refresh token (longer expiry)
    const refreshToken = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        type: 'refresh'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name
      },
      accessToken: token,
      refreshToken: refreshToken
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login'
    });
  }
});

// Verify token
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    // Get user details from database
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, created_at FROM users WHERE id = $1 AND is_active = true',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during token verification'
    });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    // Generate new access token
    const newAccessToken = jwt.sign(
      { 
        userId: decoded.userId, 
        email: decoded.email 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Generate new refresh token
    const newRefreshToken = jwt.sign(
      { 
        userId: decoded.userId, 
        email: decoded.email,
        type: 'refresh'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid or expired refresh token'
    });
  }
});

// Logout (client-side token removal, but we can blacklist tokens here if needed)
router.post('/logout', authenticateToken, async (req, res) => {
  /**
   * Extract the raw JWT from the Authorization header so we can
   * invalidate it server-side by pushing it into the Redis blacklist.
   */
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // This should never happen because authenticateToken already checked it,
    // but handle defensively.
    return res.status(400).json({
      success: false,
      message: 'Unable to process logout: token missing.'
    });
  }

  try {
    const blacklisted = await addToBlacklist(token);

    return res.json({
      success: true,
      message: blacklisted
        ? 'Logout successful. Token has been revoked.'
        : 'Logout successful. (Token revocation skipped – Redis unavailable)',
    });
  } catch (err) {
    // Fail-open: still let the client know logout succeeded, but log the error.
    console.error('Error blacklisting token during logout:', err);
    return res.json({
      success: true,
      message: 'Logout successful, but token could not be revoked server-side.',
    });
  }
});

/**
 * ---------------------------------------------------------------------------
 * GET /api/auth/csrf-token
 * ---------------------------------------------------------------------------
 * Returns a fresh CSRF token for authenticated users.
 *
 * Workflow:
 *   1. `authenticateToken` verifies JWT and populates `req.user`.
 *   2. `sendNewCsrfToken` generates a new CSRF token, stores it in Redis,
 *      sets a cookie (`_csrfToken`), and responds with JSON:
 *        { success: true, csrfToken: "<token>" }
 *
 * Frontend Usage:
 *   - Call this endpoint immediately after login (or page refresh) to obtain
 *     a valid CSRF token.
 *   - Include the token in the `X-CSRF-Token` header for all subsequent
 *     POST / PUT / DELETE / PATCH requests.
 */
router.get('/csrf-token', authenticateToken, (req, res) => {
  // Handler wrapper since `sendNewCsrfToken` can act as a standalone endpoint
  // when called with (req, res) only.
  sendNewCsrfToken(req, res);
});

module.exports = router;
