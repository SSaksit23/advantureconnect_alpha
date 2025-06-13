// backend/services/cacheService.js
const winston = require('winston');
const crypto = require('crypto');
const { redisClient, pool } = require('../models/database'); // Assuming redisClient and pool are properly exported
const env = require('../config/env');

const logger = winston.createLogger({
  level: env.getEnv('LOG_LEVEL', 'info'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'cache-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    // Add file transports if needed
  ],
});

const DEFAULT_REDIS_TTL_SECONDS = env.getEnv('CACHE_REDIS_DEFAULT_TTL_SECONDS', 15 * 60, 'number'); // 15 minutes
const DEFAULT_DB_CACHE_TTL_SECONDS = env.getEnv('CACHE_DB_DEFAULT_TTL_SECONDS', 60 * 60, 'number'); // 1 hour

const CACHE_TABLE_MAP = {
  flight: 'flight_cache',
  hotel: 'hotel_cache',
  // Add 'activity': 'activity_cache', 'poi': 'poi_cache' when tables are created
};

class CacheService {
  constructor() {
    this.redisAvailable = false;
    this._checkRedisAvailability();
  }

  async _checkRedisAvailability() {
    if (redisClient && redisClient.isOpen) {
      try {
        await redisClient.ping();
        this.redisAvailable = true;
        logger.info('CacheService: Redis connection confirmed.');
      } catch (error) {
        this.redisAvailable = false;
        logger.warn('CacheService: Redis ping failed, Redis caching will be disabled.', { error: error.message });
      }
    } else {
      this.redisAvailable = false;
      logger.warn('CacheService: Redis client not available or not open, Redis caching will be disabled.');
    }
  }

  /**
   * Generates a stable cache key from a type and parameters object.
   * @param {string} cacheType - The type of cache (e.g., 'flight', 'hotel').
   * @param {object} params - The parameters object to generate the key from.
   * @returns {string} A SHA256 hash representing the cache key.
   */
  _generateCacheKey(cacheType, params) {
    // Sort keys for stability, then stringify
    const sortedParams = {};
    Object.keys(params).sort().forEach(key => {
      sortedParams[key] = params[key];
    });
    const paramString = JSON.stringify(sortedParams);
    const hash = crypto.createHash('sha256').update(`${cacheType}:${paramString}`).digest('hex');
    return `${cacheType}:${hash}`;
  }

  /**
   * Retrieves data from the cache. Tries Redis first, then database cache.
   * @param {string} cacheType - Type of cache (e.g., 'flight', 'hotel').
   * @param {object} params - Parameters object used to generate the cache key.
   * @returns {Promise<object|null>} The cached data (parsed JSON) or null if not found/expired.
   */
  async get(cacheType, params) {
    const cacheKey = this._generateCacheKey(cacheType, params);
    let data = null;

    // 1. Try Redis
    if (this.redisAvailable) {
      try {
        const redisData = await redisClient.get(cacheKey);
        if (redisData) {
          logger.debug(`CacheService: Redis HIT for key ${cacheKey.substring(0, 20)}...`);
          try {
            data = JSON.parse(redisData);
            return data;
          } catch (parseError) {
            logger.error(`CacheService: Failed to parse Redis data for key ${cacheKey}. Invalidating.`, { error: parseError.message });
            await this.invalidate(cacheType, params); // Invalidate corrupt data
            return null;
          }
        }
        logger.debug(`CacheService: Redis MISS for key ${cacheKey.substring(0, 20)}...`);
      } catch (redisError) {
        logger.error(`CacheService: Redis GET error for key ${cacheKey}.`, { error: redisError.message });
        this.redisAvailable = false; // Assume Redis is down if GET fails
      }
    }

    // 2. Try Database Cache if not found in Redis or Redis is unavailable
    const tableName = CACHE_TABLE_MAP[cacheType];
    if (!tableName) {
      logger.warn(`CacheService: No DB cache table defined for cacheType '${cacheType}'.`);
      return null;
    }

    try {
      const query = `SELECT results, expires_at FROM ${tableName} WHERE cache_key = $1 AND expires_at > NOW()`;
      const { rows } = await pool.query(query, [cacheKey]);

      if (rows.length > 0) {
        logger.debug(`CacheService: DB Cache HIT for key ${cacheKey.substring(0, 20)}...`);
        data = rows[0].results; // Assuming 'results' column stores JSONB or JSON string

        // Promote to Redis if Redis is available
        if (this.redisAvailable && data) {
          const dbExpiresAt = new Date(rows[0].expires_at).getTime();
          const now = Date.now();
          const redisTtl = Math.max(0, Math.floor((dbExpiresAt - now) / 1000));
          if (redisTtl > 0) {
            try {
              await redisClient.set(cacheKey, JSON.stringify(data), { EX: redisTtl });
              logger.info(`CacheService: Promoted DB cache entry to Redis for key ${cacheKey.substring(0, 20)}... with TTL ${redisTtl}s`);
            } catch (promoError) {
              logger.error(`CacheService: Failed to promote DB cache to Redis for key ${cacheKey}.`, { error: promoError.message });
            }
          }
        }
        return data; // data is already parsed if it's JSONB from DB
      }
      logger.debug(`CacheService: DB Cache MISS for key ${cacheKey.substring(0, 20)}...`);
    } catch (dbError) {
      logger.error(`CacheService: DB Cache GET error for key ${cacheKey}.`, { error: dbError.message, query });
    }

    return null;
  }

  /**
   * Stores data in the cache (both Redis and database).
   * @param {string} cacheType - Type of cache.
   * @param {object} params - Parameters object used for key generation and DB storage.
   * @param {object} dataToCache - The data to cache (will be JSON.stringify'd).
   * @param {number} [ttlSeconds] - Optional TTL in seconds. Uses defaults if not provided.
   *                                 Separate TTLs can be configured for Redis and DB.
   * @returns {Promise<boolean>} True if successful in setting at least one cache, false otherwise.
   */
  async set(cacheType, params, dataToCache, ttlSeconds = null) {
    const cacheKey = this._generateCacheKey(cacheType, params);
    const stringifiedData = JSON.stringify(dataToCache);
    let redisSuccess = false;
    let dbSuccess = false;

    const redisTtl = ttlSeconds !== null ? ttlSeconds : DEFAULT_REDIS_TTL_SECONDS;
    const dbTtl = ttlSeconds !== null ? ttlSeconds : DEFAULT_DB_CACHE_TTL_SECONDS;

    // 1. Set in Redis
    if (this.redisAvailable && redisTtl > 0) {
      try {
        await redisClient.set(cacheKey, stringifiedData, { EX: redisTtl });
        logger.debug(`CacheService: Redis SET success for key ${cacheKey.substring(0, 20)}... with TTL ${redisTtl}s`);
        redisSuccess = true;
      } catch (redisError) {
        logger.error(`CacheService: Redis SET error for key ${cacheKey}.`, { error: redisError.message });
        this.redisAvailable = false;
      }
    }

    // 2. Set in Database Cache
    const tableName = CACHE_TABLE_MAP[cacheType];
    if (!tableName) {
      logger.warn(`CacheService: No DB cache table defined for cacheType '${cacheType}'. Cannot set DB cache.`);
      return redisSuccess; // Return Redis success status if DB table not found
    }

    if (dbTtl > 0) {
        try {
          const expiresAt = new Date(Date.now() + dbTtl * 1000).toISOString();
          const query = `
            INSERT INTO ${tableName} (cache_key, search_params, results, expires_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (cache_key) DO UPDATE SET
              search_params = EXCLUDED.search_params,
              results = EXCLUDED.results,
              expires_at = EXCLUDED.expires_at,
              created_at = NOW()`; // Update created_at on conflict as well to signify refresh
    
          await pool.query(query, [cacheKey, params, dataToCache, expiresAt]); // Store raw dataToCache (JSONB)
          logger.debug(`CacheService: DB Cache SET success for key ${cacheKey.substring(0, 20)}... with TTL ${dbTtl}s`);
          dbSuccess = true;
        } catch (dbError) {
          logger.error(`CacheService: DB Cache SET error for key ${cacheKey}.`, { error: dbError.message, query });
        }
    }

    return redisSuccess || dbSuccess;
  }

  /**
   * Invalidates/deletes a cache entry from both Redis and database.
   * @param {string} cacheType - Type of cache.
   * @param {object} params - Parameters object used to generate the cache key.
   * @returns {Promise<boolean>} True if successful in deleting from at least one cache, false otherwise.
   */
  async invalidate(cacheType, params) {
    const cacheKey = this._generateCacheKey(cacheType, params);
    let redisSuccess = false;
    let dbSuccess = false;

    // 1. Delete from Redis
    if (this.redisAvailable) {
      try {
        const numDeleted = await redisClient.del(cacheKey);
        if (numDeleted > 0) {
            logger.debug(`CacheService: Redis DEL success for key ${cacheKey.substring(0, 20)}...`);
        }
        redisSuccess = true; // Consider successful even if key didn't exist
      } catch (redisError) {
        logger.error(`CacheService: Redis DEL error for key ${cacheKey}.`, { error: redisError.message });
        this.redisAvailable = false;
      }
    }

    // 2. Delete from Database Cache
    const tableName = CACHE_TABLE_MAP[cacheType];
    if (!tableName) {
      logger.warn(`CacheService: No DB cache table defined for cacheType '${cacheType}'. Cannot invalidate DB cache.`);
      return redisSuccess;
    }

    try {
      const query = `DELETE FROM ${tableName} WHERE cache_key = $1`;
      const result = await pool.query(query, [cacheKey]);
      if (result.rowCount > 0) {
        logger.debug(`CacheService: DB Cache DEL success for key ${cacheKey.substring(0, 20)}...`);
      }
      dbSuccess = true; // Consider successful even if key didn't exist
    } catch (dbError) {
      logger.error(`CacheService: DB Cache DEL error for key ${cacheKey}.`, { error: dbError.message, query });
    }

    return redisSuccess || dbSuccess;
  }

  /**
   * Clears expired entries from a specific database cache table.
   * This should be run periodically by a background job or cron.
   * @param {string} cacheType - Type of cache (e.g., 'flight', 'hotel').
   * @returns {Promise<number|null>} Number of rows deleted, or null on error/invalid type.
   */
  async clearExpiredDbCache(cacheType) {
    const tableName = CACHE_TABLE_MAP[cacheType];
    if (!tableName) {
      logger.warn(`CacheService: No DB cache table defined for cacheType '${cacheType}'. Cannot clear expired entries.`);
      return null;
    }

    try {
      const query = `DELETE FROM ${tableName} WHERE expires_at < NOW()`;
      const result = await pool.query(query);
      logger.info(`CacheService: Cleared ${result.rowCount} expired entries from DB cache table '${tableName}'.`);
      return result.rowCount;
    } catch (dbError) {
      logger.error(`CacheService: Error clearing expired DB cache for '${tableName}'.`, { error: dbError.message, query });
      return null;
    }
  }

  /**
   * Wraps an async function call with caching logic.
   * If data is in cache and valid, returns cached data.
   * Otherwise, calls the function, caches its result, and returns the result.
   * @param {string} cacheType - Type of cache.
   * @param {object} params - Parameters for the function and cache key.
   * @param {Function} fnToCache - The async function to call if cache miss. It will be called with `params`.
   * @param {number} [ttlSeconds] - Optional TTL for this specific cache entry.
   * @returns {Promise<any>} The result from cache or the function.
   */
  async wrap(cacheType, params, fnToCache, ttlSeconds = null) {
    const cachedData = await this.get(cacheType, params);
    if (cachedData !== null) {
      logger.debug(`CacheService Wrap: Cache HIT for ${cacheType} with params ${JSON.stringify(params).substring(0,50)}...`);
      return cachedData;
    }

    logger.debug(`CacheService Wrap: Cache MISS for ${cacheType} with params ${JSON.stringify(params).substring(0,50)}... Calling function.`);
    const freshData = await fnToCache(params);

    if (freshData !== null && freshData !== undefined) { // Do not cache null/undefined results from the function itself
      await this.set(cacheType, params, freshData, ttlSeconds);
    }
    return freshData;
  }
}

// Export a singleton instance
module.exports = new CacheService();
