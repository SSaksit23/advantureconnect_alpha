// backend/services/activityApiService.js
const axios = require('axios');
const winston = require('winston');
const qs = require('qs');
const env = require('../config/env');

// Configure logger for this service
const logger = winston.createLogger({
  level: env.getEnv('LOG_LEVEL', 'info'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'activity-api-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    // Add file transports if needed
  ],
});

const AMADEUS_TEST_HOSTNAME = 'test.api.amadeus.com';
const AMADEUS_PROD_HOSTNAME = 'api.amadeus.com';

class ActivityApiService {
  constructor(amadeusSdkClient = null) {
    this.clientId = env.AMADEUS_CLIENT_ID;
    this.clientSecret = env.AMADEUS_CLIENT_SECRET;
    this.hostname = env.AMADEUS_HOSTNAME === 'production' ? AMADEUS_PROD_HOSTNAME : AMADEUS_TEST_HOSTNAME;
    
    this.amadeusSdkClient = amadeusSdkClient;

    this.accessToken = null;
    this.tokenExpiry = null;

    if (!this.clientId || !this.clientSecret) {
      logger.warn(
        'Amadeus API Client ID or Secret is not configured. ActivityApiService may not function correctly if not using SDK.'
      );
    }
    
    if (!this.amadeusSdkClient) {
        this.client = axios.create({
          baseURL: `https://${this.hostname}`,
          timeout: 30000, // 30 seconds
        });
    
        this.client.interceptors.request.use(
          async (config) => {
            if (!config.url.includes('/v1/security/oauth2/token')) { // Don't add auth header to token request itself
              const token = await this._getAccessToken();
              config.headers.Authorization = `Bearer ${token}`;
            }
            logger.info(`Amadeus Activity/POI API Request: ${config.method.toUpperCase()} ${config.baseURL}${config.url}`, { params: config.params });
            return config;
          },
          (error) => {
            logger.error('Amadeus Activity/POI API Request Error Interceptor', { error });
            return Promise.reject(error);
          }
        );
    
        this.client.interceptors.response.use(
          (response) => {
            logger.info(`Amadeus Activity/POI API Response: ${response.status} ${response.config.url}`);
            return response;
          },
          (error) => {
            logger.error('Amadeus Activity/POI API Response Error Interceptor', {
              status: error.response?.status,
              message: error.message,
              url: error.config?.url,
              responseData: error.response?.data,
            });
            return Promise.reject(error);
          }
        );
    } else {
        logger.info('ActivityApiService initialized with pre-configured Amadeus SDK client.');
    }
  }

  async _getAccessToken() {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }

    if (!this.clientId || !this.clientSecret) {
      throw new Error('Amadeus client ID or secret not configured for token fetching.');
    }

    logger.info('Fetching new Amadeus access token for Activity/POI service...');
    try {
      const response = await axios.post(
        `https://${this.hostname}/v1/security/oauth2/token`,
        qs.stringify({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000; // Buffer
      logger.info('Successfully fetched new Amadeus access token for Activity/POI service.');
      return this.accessToken;
    } catch (error) {
      logger.error('Failed to fetch Amadeus access token for Activity/POI service', this._handleApiError(error, 'token_fetch'));
      throw new Error('Could not authenticate with Amadeus API for Activity/POI service.');
    }
  }

  _handleApiError(error, context = 'general') {
    const errorResponse = {
      success: false,
      message: 'An unexpected error occurred with the Activity/POI API.',
      providerErrors: [],
      status: 500,
      context,
    };

    if (error.response) {
      errorResponse.status = error.response.status;
      errorResponse.message = `Activity/POI API request failed with status ${error.response.status}.`;
      if (error.response.data && error.response.data.errors) {
        errorResponse.providerErrors = error.response.data.errors.map(e => ({
          code: e.code,
          title: e.title,
          detail: e.detail,
          status: e.status,
        }));
        if (errorResponse.providerErrors.length > 0) {
          errorResponse.message = errorResponse.providerErrors[0].title || errorResponse.providerErrors[0].detail || errorResponse.message;
        }
      } else if (error.response.data) {
         errorResponse.message = JSON.stringify(error.response.data).substring(0,200);
      }
    } else if (error.request) {
      errorResponse.message = 'No response received from Activity/POI API.';
      errorResponse.status = 504; 
    } else {
      errorResponse.message = error.message || 'Error setting up request to Activity/POI API.';
    }
    logger.error(`Activity/POI API Error in context '${context}': ${errorResponse.message}`, { errorDetails: errorResponse });
    // Instead of returning, throw a new error with the structured response,
    // so the caller can catch a single error type.
    const customError = new Error(errorResponse.message);
    customError.details = errorResponse;
    customError.status = errorResponse.status;
    throw customError;
  }

  _formatPoiResponse(amadeusPoiData) {
    return {
      id: amadeusPoiData.id,
      providerId: amadeusPoiData.id,
      provider: 'Amadeus',
      name: amadeusPoiData.name,
      category: amadeusPoiData.category,
      tags: amadeusPoiData.tags || [],
      rank: amadeusPoiData.rank,
      location: {
        latitude: parseFloat(amadeusPoiData.geoCode?.latitude),
        longitude: parseFloat(amadeusPoiData.geoCode?.longitude),
      },
    };
  }

  _formatActivityResponse(amadeusActivityData) {
    return {
      id: amadeusActivityData.id,
      providerId: amadeusActivityData.id,
      provider: 'Amadeus',
      name: amadeusActivityData.name,
      description: amadeusActivityData.shortDescription,
      longDescription: amadeusActivityData.description, // If available
      categories: amadeusActivityData.categories || [], // Amadeus uses 'categories'
      bookingLink: amadeusActivityData.bookingLink, // Direct booking link if provided
      price: amadeusActivityData.price ? {
        amount: parseFloat(amadeusActivityData.price.amount),
        currency: amadeusActivityData.price.currencyCode,
      } : null,
      duration: amadeusActivityData.minimumDuration || amadeusActivityData.maximumDuration, // e.g., "PT2H"
      rating: amadeusActivityData.rating ? parseFloat(amadeusActivityData.rating) : null, // 0-5
      pictures: amadeusActivityData.pictures || [], // Array of URLs
      location: amadeusActivityData.geoCode ? {
        latitude: parseFloat(amadeusActivityData.geoCode.latitude),
        longitude: parseFloat(amadeusActivityData.geoCode.longitude),
        // addressText: formatted address if available from Amadeus
      } : null,
      // Amadeus Tours & Activities API doesn't typically return specific start/end dates in the list view.
      // These might be part of the booking process or specific offer details.
      // startDate, endDate would be relevant if searching for availability.
    };
  }

  async _search(endpoint, params, formatter, context) {
    try {
      let response;
      if (this.amadeusSdkClient) {
        // Construct the SDK call dynamically - this is a bit tricky
        // Example: this.amadeusSdkClient.referenceData.locations.pointsOfInterest.get(params)
        // This needs careful mapping of endpoint to SDK methods.
        // For simplicity, this example will assume direct client for now if SDK path is complex.
        // If you have a clear SDK path, implement it here.
        // e.g. if (endpoint.includes('pois')) response = await this.amadeusSdkClient.referenceData.locations.pointsOfInterest.get(params);
        // else if (endpoint.includes('activities')) response = await this.amadeusSdkClient.shopping.activities.get(params);
        // else throw new Error('Unsupported SDK endpoint for ActivityApiService');
        // For now, let's assume SDK usage means the token is handled by the SDK client.
        // This part is highly dependent on how the Amadeus SDK is structured.
        // For a generic approach, we might need a mapping.
        // If using amadeusSdkClient for this, ensure it's properly authenticated.
        // This example will proceed with direct client for clarity on API calls.
        if (context === 'getPoisByCoordinates' && this.amadeusSdkClient?.referenceData?.locations?.pointsOfInterest) {
            response = await this.amadeusSdkClient.referenceData.locations.pointsOfInterest.get(params);
        } else if (context === 'searchActivitiesByCoordinates' && this.amadeusSdkClient?.shopping?.activities) {
            response = await this.amadeusSdkClient.shopping.activities.get(params);
        } else {
            // Fallback or error if specific SDK path not found
            logger.warn(`SDK path for ${context} not explicitly defined, attempting direct call.`);
            await this._getAccessToken(); // Ensure token for direct call
            response = await this.client.get(endpoint, { params });
            response = { result: response.data }; // Mimic SDK response structure for formatter
        }
      } else {
        await this._getAccessToken();
        response = await this.client.get(endpoint, { params });
        response = { result: response.data }; // Mimic SDK response structure for formatter
      }

      const responseData = response.result; // Assuming SDK returns data in response.result
      const items = responseData.data || [];
      const formattedItems = items.map(item => formatter(item));
      
      return {
        success: true,
        searchParams: params,
        results: {
          items: formattedItems,
          totalResults: formattedItems.length,
          pagination: responseData.meta?.page || responseData.meta?.pagination || null,
        },
        meta: {
          provider: 'Amadeus',
          searchTime: new Date().toISOString(),
        },
      };
    } catch (error) {
      // _handleApiError now throws, so we just re-throw or let it propagate
      // If we want to return a structured error from here, we'd catch and format.
      // For consistency with HotelApiService, we let _handleApiError throw.
      this._handleApiError(error, context);
    }
  }

  /**
   * Search Points of Interest by coordinates.
   * @param {object} params - { latitude, longitude, radius (km), categories (comma-separated, e.g., SIGHTS,NIGHTLIFE), pageLimit, pageOffset }
   */
  async getPoisByCoordinates(params) {
    const { latitude, longitude, radius = 1, categories, pageLimit = 10, pageOffset } = params;
    if (!latitude || !longitude) {
      throw new Error('Latitude and longitude are required for POI search by coordinates.');
    }
    const queryParams = {
      latitude,
      longitude,
      radius,
      'page[limit]': pageLimit,
    };
    if (categories) queryParams.categories = categories.toUpperCase();
    if (pageOffset) queryParams['page[offset]'] = pageOffset;

    return this._search('/v1/reference-data/locations/pois', queryParams, this._formatPoiResponse, 'getPoisByCoordinates');
  }

  /**
   * Search Points of Interest by a geographic square.
   * @param {object} params - { north, west, south, east, categories, pageLimit, pageOffset }
   */
  async getPoisBySquare(params) {
    const { north, west, south, east, categories, pageLimit = 10, pageOffset } = params;
    if (!north || !west || !south || !east) {
      throw new Error('Bounding box coordinates (north, west, south, east) are required for POI search by square.');
    }
    const queryParams = { north, west, south, east, 'page[limit]': pageLimit };
    if (categories) queryParams.categories = categories.toUpperCase();
    if (pageOffset) queryParams['page[offset]'] = pageOffset;
    
    return this._search('/v1/reference-data/locations/pois/by-square', queryParams, this._formatPoiResponse, 'getPoisBySquare');
  }

  /**
   * Search Tours and Activities by coordinates.
   * @param {object} params - { latitude, longitude, radius (km), startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), pageLimit, pageOffset }
   */
  async searchActivitiesByCoordinates(params) {
    const { latitude, longitude, radius = 1, startDate, endDate, pageLimit = 10, pageOffset } = params;
    if (!latitude || !longitude) {
      throw new Error('Latitude and longitude are required for activity search by coordinates.');
    }
    const queryParams = { latitude, longitude, radius, 'page[limit]': pageLimit };
    if (startDate) queryParams.startDate = startDate; // Optional
    if (endDate) queryParams.endDate = endDate;       // Optional
    if (pageOffset) queryParams['page[offset]'] = pageOffset;

    return this._search('/v1/shopping/activities', queryParams, this._formatActivityResponse, 'searchActivitiesByCoordinates');
  }

  /**
   * Search Tours and Activities by a geographic square.
   * @param {object} params - { north, west, south, east, startDate, endDate, pageLimit, pageOffset }
   */
  async searchActivitiesBySquare(params) {
    const { north, west, south, east, startDate, endDate, pageLimit = 10, pageOffset } = params;
    if (!north || !west || !south || !east) {
      throw new Error('Bounding box coordinates are required for activity search by square.');
    }
    const queryParams = { north, west, south, east, 'page[limit]': pageLimit };
    if (startDate) queryParams.startDate = startDate;
    if (endDate) queryParams.endDate = endDate;
    if (pageOffset) queryParams['page[offset]'] = pageOffset;

    return this._search('/v1/shopping/activities/by-square', queryParams, this._formatActivityResponse, 'searchActivitiesBySquare');
  }

  /**
   * Get details for a specific activity.
   * @param {string} activityId - The Amadeus ID of the activity.
   */
  async getActivityDetails(activityId) {
    if (!activityId) {
      throw new Error('Activity ID is required to fetch details.');
    }
    
    try {
      let response;
      const endpoint = `/v1/shopping/activities/${activityId}`;
      if (this.amadeusSdkClient?.shopping?.activity) { // Assuming SDK structure
        response = await this.amadeusSdkClient.shopping.activity(activityId).get();
      } else {
        await this._getAccessToken();
        response = await this.client.get(endpoint);
        response = { result: response.data }; // Mimic SDK
      }

      const responseData = response.result;
      if (!responseData.data) {
        throw new Error('No data found for this activity ID.');
      }
      
      const formattedActivity = this._formatActivityResponse(responseData.data);
      return {
        success: true,
        results: {
          activity: formattedActivity,
        },
        meta: {
          provider: 'Amadeus',
          fetchTime: new Date().toISOString(),
        },
      };
    } catch (error) {
      this._handleApiError(error, `getActivityDetails (id: ${activityId})`);
    }
  }

  getStatus() {
    return {
      service: 'ActivityApiService (Amadeus)',
      status: (this.clientId && this.clientSecret) || this.amadeusSdkClient ? 'configured' : 'not_configured',
      hostname: this.hostname,
      sdkInUse: !!this.amadeusSdkClient,
      notes: 'Provides Points of Interest and Tours & Activities search using Amadeus API.',
    };
  }
}

module.exports = ActivityApiService;
