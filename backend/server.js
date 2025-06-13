const express = require('express');
const cors = require('cors');
// const dotenv = require('dotenv'); // Replaced by centralized env config
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const winston = require('winston');
const Amadeus = require('amadeus');
const rateLimit = require('express-rate-limit');
const http = require('http'); // For Socket.IO and graceful shutdown
const { Server } = require("socket.io"); // For Socket.IO

// --- Centralized Environment Configuration & Validation ---
const env = require('./config/env');
env.validateRequiredEnvVars(); // Validate critical environment variables *before* anything else boots

// --- Custom Modules ---
const { pool, connectRedis, redisClient: directRedisClient } = require('./models/database');
const authRoutes = require('./routes/auth');
const flightRoutes = require('./routes/flights');
const hotelRoutes = require('./routes/hotels');
const tripCustomizationRoutes = require('./routes/tripCustomization');
// const providerRoutes = require('./routes/providers'); // Temporarily disabled
const tripRoutes = require('./routes/trips');
const searchRoutes = require('./routes/search');
// const recommendationsRoutes = require('./routes/recommendations'); // Temporarily disabled

// --- Response and Error Handling Utilities ---
const { successResponse, errorResponse, AppError } = require('./utils/responseHandler');
const globalErrorHandler = require('./middleware/errorHandler');
const { csrfProtection } = require('./middleware/csrf');

// --- Winston Logger Setup ---
const logger = winston.createLogger({
  level: env.logLevel, // Use env.logLevel
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'adventureconnect-api' },
  transports: [
    // File logging disabled to avoid directory issues in Docker
    // new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    // new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (env.env !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

// Morgan stream for HTTP request logging through Winston
const morganStream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

// --- Initialize Express App ---
const app = express();
const server = http.createServer(app); // Create HTTP server for Express and Socket.IO
const port = env.port; // Use env.port

// --- Initialize Amadeus Client ---
const amadeus = new Amadeus({
  clientId: env.AMADEUS_CLIENT_ID, // Use env
  clientSecret: env.AMADEUS_CLIENT_SECRET, // Use env
  hostname: env.AMADEUS_HOSTNAME || 'test', // Use env, default to 'test'
  logger: logger,
  logLevel: env.env === 'development' ? 'debug' : 'silent' // Use env
});

// --- Connect to Redis ---
let redisClientInstance; // To store the connected client from connectRedis
connectRedis()
  .then(client => {
    redisClientInstance = client; // Store the client instance
    logger.info('Redis connected successfully for the main application.');
    // Make redisClientInstance available to other modules if needed, e.g., app.set('redisClient', redisClientInstance);
    // For CSRF and Cache services, they import `redisClient` from `models/database.js` directly.
  })
  .catch(err => {
    logger.error('Failed to connect to Redis for the main application:', err);
    // Consider implications if Redis is critical (e.g., for CSRF, Caching, Sessions)
    // The application might need to run in a degraded mode or exit.
    // For now, CSRF and Cache services have internal checks for Redis availability.
  });

// --- Socket.IO Setup ---
const corsOrigins = env.CORS_ORIGIN
  ? env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000']; // Default if not set

const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  logger.info(`Socket.IO: User connected ${socket.id}`);
  socket.on('disconnect', () => {
    logger.info(`Socket.IO: User disconnected ${socket.id}`);
  });
});
app.set('socketio', io);


// --- Core Middleware ---
app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  // Ensure X-CSRF-Token is allowed if not covered by default
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan(':method :url :status :res[content-length] - :response-time ms', { stream: morganStream }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// --- Rate Limiting ---\
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.getEnv('RATE_LIMIT_GENERAL_MAX', 200, 'number'), // Configurable
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes.',
  handler: (req, res, next, options) => {
    logger.warn(`Rate limit exceeded for IP ${req.ip}`, { path: req.path, limit: options.max, windowMs: options.windowMs });
    // Use standardized error response
    errorResponse(res, options.statusCode, options.message);
  }
});
app.use(generalLimiter);

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: env.getEnv('RATE_LIMIT_AUTH_MAX', 10, 'number'), // Configurable
  message: 'Too many authentication attempts, please try again after 5 minutes.',
  handler: (req, res, next, options) => {
    logger.warn(`Auth rate limit exceeded for IP ${req.ip}`, { path: req.path, limit: options.max, windowMs: options.windowMs });
    // Use standardized error response
    errorResponse(res, options.statusCode, options.message);
  }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// --- CSRF Protection Middleware ---
// Paths exempt from CSRF protection (e.g., login, register, token refresh, CSRF token fetch)
const CSRF_EXEMPT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/csrf-token'
  // Add other paths like webhook endpoints if necessary
]);

app.use((req, res, next) => {
  if (CSRF_EXEMPT_PATHS.has(req.path)) {
    return next();
  }
  // Apply csrfProtection middleware to all other relevant requests
  return csrfProtection(req, res, next);
});


// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/flights', flightRoutes);
app.use('/api/hotels', hotelRoutes);
app.use('/api/trip-customization', tripCustomizationRoutes);
// app.use('/api/providers', providerRoutes); // Temporarily disabled
app.use('/api/trips', tripRoutes);
app.use('/api/search', searchRoutes);
// app.use('/api/recommendations', recommendationsRoutes); // Temporarily disabled

// Health Check Endpoint
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    const dbStatus = 'Connected';

    let redisStatus = 'Disconnected';
    // Use the stored redisClientInstance or directRedisClient from models/database
    const currentRedisClient = redisClientInstance || directRedisClient;
    if (currentRedisClient && currentRedisClient.isOpen) {
        try {
            await currentRedisClient.ping();
            redisStatus = 'Connected';
        } catch (pingError) {
            logger.warn('Health Check: Redis ping failed.', { error: pingError.message });
            redisStatus = 'Ping Failed';
        }
    }

    const healthData = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      message: 'AdventureConnect Backend is running and healthy!',
      services: {
        database: dbStatus,
        redis: redisStatus,
        amadeus: (env.AMADEUS_CLIENT_ID && env.AMADEUS_CLIENT_SECRET) ? 'Configured' : 'Not Configured',
        flightapi: env.FLIGHT_API_KEY ? 'Configured' : 'Not Configured',
        // makcorps: env.MAKCORPS_API_KEY ? 'Configured' : 'Not Configured', // Assuming this is removed or replaced
        googleFlights: env.GOOGLE_FLIGHTS_API_KEY ? 'Configured (Hypothetical)' : 'Not Configured',
        tripCustomization: 'Operational'
      },
      uptime: process.uptime()
    };
    successResponse(res, 200, 'System health is OK.', healthData);
  } catch (error) {
    logger.error('Health check failed:', error);
    // Use AppError for structured error to be handled by globalErrorHandler
    // Or directly use errorResponse if preferred for health check specifics
    const healthErrorDetails = {
        database: error.message.includes('database') || error.message.includes('PostgreSQL') ? 'Error' : 'Potentially Connected',
        redis: error.message.includes('redis') ? 'Error' : 'Potentially Connected',
        details: error.message
    };
    errorResponse(res, 503, 'One or more critical services are down.', healthErrorDetails);
  }
});


// --- 404 Not Found Handler ---
// This should come after all valid routes
app.use((req, res, next) => {
  // Create an AppError for 404s
  next(new AppError(`The requested URL ${req.originalUrl} was not found on this server.`, 404));
});

// --- Global Error Handler ---
// This must be the last piece of middleware
app.use(globalErrorHandler);

// --- Start Server and Graceful Shutdown ---\
const startServer = () => {
  server.listen(port, '0.0.0.0', () => { // Listen on 0.0.0.0 for Docker compatibility
    logger.info(`🚀 AdventureConnect Backend running on port ${port} in ${env.env} mode`);
    logger.info(`✅ Health check available at http://localhost:${port}/api/health`);
    logger.info('Press Ctrl-C to stop\n');
  });
};

const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    logger.info('HTTP server closed.');
    try {
      await pool.end();
      logger.info('PostgreSQL pool has ended.');
    } catch (e) {
      logger.error('Error closing PostgreSQL pool:', e);
    }
    try {
      const currentRedisClient = redisClientInstance || directRedisClient;
      if (currentRedisClient && currentRedisClient.isOpen) {
        await currentRedisClient.quit();
        logger.info('Redis client disconnected.');
      }
    } catch (e) {
      logger.error('Error closing Redis client:', e);
    }
    process.exit(0);
  });

  // Force shutdown if graceful shutdown takes too long
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000); // 10 seconds
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Catches Ctrl+C

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason: reason.stack || reason });
  // Optionally, you might want to initiate a graceful shutdown here too,
  // depending on how critical unhandled rejections are for your application.
  // gracefulShutdown('unhandledRejection').then(() => process.exit(1));
});

// Catch uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { error: error.stack || error });
  // For uncaught exceptions, it's generally recommended to exit after logging,
  // as the application state might be corrupted.
  gracefulShutdown('uncaughtException').then(() => process.exit(1));
});

startServer();

module.exports = app; // For testing purposes
