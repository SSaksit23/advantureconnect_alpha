// backend/config/env.js
const path = require('path');

// Load environment variables from .env file in development and test environments
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
}

const NODE_ENV = process.env.NODE_ENV || 'development';

// Define required environment variables.
// These must be set in the environment (e.g., .env file or system env vars)
// for the application to start. NO DEFAULTS for these in the code.
const REQUIRED_ENV_VARS = [
  'DATABASE_URL', // Example: postgresql://user:password@host:port/database
  'JWT_SECRET',   // A strong, unique secret for signing JWTs
  'RAPIDAPI_KEY', // For services like Booking.com, Hotels.com alternatives
  'FLIGHT_API_KEY', // For FlightAPI.io
  // 'OPENWEATHER_API_KEY', // Uncomment if essential for core functionality
  // 'GEMINI_API_KEY',      // Uncomment if essential for core functionality
];

// Base configuration applicable to all environments
const baseConfig = {
  env: NODE_ENV,
  port: parseInt(process.env.PORT, 10) || 5000,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h', // Default JWT expiry
  // API URLs - good practice to make these configurable too
  flightApiBaseUrl: process.env.FLIGHT_API_BASE_URL || 'https://api.flightapi.io', // Example
  // Add other non-sensitive, configurable parameters with safe defaults
};

// Environment-specific configurations
const environmentConfigs = {
  development: {
    logLevel: process.env.LOG_LEVEL || 'debug',
    // Add any development-specific overrides or additions
  },
  test: {
    logLevel: process.env.LOG_LEVEL || 'warn',
    port: parseInt(process.env.PORT, 10) || 5001, // Often use a different port for tests
    // Test-specific database URL might be set via process.env.DATABASE_URL directly
  },
  production: {
    logLevel: process.env.LOG_LEVEL || 'info',
    // Production specific settings, e.g., more aggressive caching, different API endpoints
  },
};

// Merge base config with environment-specific config
const appConfig = { ...baseConfig, ...environmentConfigs[NODE_ENV] };

/**
 * Validates that all required environment variables are set.
 * Throws an error and exits the process if any are missing or if JWT_SECRET is insecure in production.
 */
function validateRequiredEnvVars() {
  const missingVars = REQUIRED_ENV_VARS.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error('ERROR: Missing required environment variables:');
    missingVars.forEach(varName => console.error(`  - ${varName}`));
    console.error('Please set these variables in your .env file or system environment and restart the application.');
    process.exit(1); // Exit with error code
  }

  // Specific check for JWT_SECRET in production
  if (NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      console.error('ERROR: In production, JWT_SECRET must be set and be at least 32 characters long.');
      process.exit(1);
    }
    if (process.env.JWT_SECRET === 'fallback_jwt_secret_change_in_production' || process.env.JWT_SECRET === 'your_default_jwt_secret_here') {
      console.error('ERROR: Default or insecure JWT_SECRET is used in production. Please set a strong, unique JWT_SECRET.');
      process.exit(1);
    }
  }
  console.log('Environment variables validated successfully.');
}

/**
 * Utility function to get an environment variable with optional type conversion and default.
 * @param {string} key - The environment variable key.
 * @param {*} [defaultValue=undefined] - The default value if the key is not found (only for non-required vars).
 * @param {'string'|'number'|'boolean'} [type='string'] - The expected type of the variable.
 * @returns {*} The value of the environment variable, converted to the specified type, or the default value.
 */
function getEnv(key, defaultValue = undefined, type = 'string') {
  const value = process.env[key];

  if (value === undefined) {
    if (REQUIRED_ENV_VARS.includes(key)) {
      // This should have been caught by validateRequiredEnvVars at startup.
      // If reached here, it's an issue in the call order or logic.
      console.error(`CRITICAL ERROR: Required environment variable ${key} accessed but is undefined post-validation.`);
      // Depending on strictness, you might want to throw here too or return undefined and let the app crash.
      // For now, we'll assume validation ensures it's present.
    }
    if (defaultValue !== undefined) {
        return defaultValue;
    }
    return undefined;
  }

  switch (type) {
    case 'number':
      const num = parseInt(value, 10);
      return isNaN(num) ? (defaultValue !== undefined ? defaultValue : undefined) : num;
    case 'boolean':
      if (value === 'true' || value === '1') return true;
      if (value === 'false' || value === '0') return false;
      return defaultValue !== undefined ? defaultValue : false; // Default to false for boolean if not clearly true/false
    default: // string
      return value;
  }
}

module.exports = {
  // Spread the resolved, non-sensitive application configuration
  ...appConfig,

  // Export the validation function to be called at application startup
  validateRequiredEnvVars,

  // Export the utility getter
  getEnv,

  // Export critical environment variables directly.
  // Their existence (and security for JWT_SECRET in prod) is ensured by validateRequiredEnvVars
  // if that function is called at the application's entry point.
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  RAPIDAPI_KEY: process.env.RAPIDAPI_KEY,
  FLIGHT_API_KEY: process.env.FLIGHT_API_KEY,
  OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY, // Will be undefined if not set and not in REQUIRED_ENV_VARS
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,          // Will be undefined if not set and not in REQUIRED_ENV_VARS
};
