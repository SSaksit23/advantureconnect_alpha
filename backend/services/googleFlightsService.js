// backend/services/googleFlightsService.js
const axios = require('axios');
const winston = require('winston');
const env = require('../config/env');
const cacheService = require('./cacheService'); // Import the CacheService
const { AppError } = require('../utils/responseHandler'); // For structured errors

// Configure logger for this service
const logger = winston.createLogger({
  level: env.getEnv('LOG_LEVEL', 'info'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'google-flights-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    // Add file transports if needed for production logs
  ],
});

// Hypothetical Google Flights Data API endpoint
// In reality, Google Flights does not offer a public search API like this.
// This is a placeholder for what such an API *might* look like.
const GOOGLE_FLIGHTS_API_BASE_URL = env.getEnv('GOOGLE_FLIGHTS_API_BASE_URL', 'https://flights.googleapis.com/v3'); // Example

const CACHE_TYPE_GOOGLE_FLIGHTS = 'google_flights';
const DEFAULT_CACHE_TTL_GOOGLE_FLIGHTS = env.getEnv('CACHE_GOOGLE_FLIGHTS_TTL_SECONDS', 10 * 60, 'number'); // 10 minutes

class GoogleFlightsService {
  constructor() {
    this.apiKey = env.getEnv('GOOGLE_FLIGHTS_API_KEY'); // This would be your API key for the hypothetical service
    this.baseURL = GOOGLE_FLIGHTS_API_BASE_URL;

    if (!this.apiKey) {
      logger.warn(
        'GOOGLE_FLIGHTS_API_KEY is not set. GoogleFlightsService will not be able to make live requests and might rely on fallbacks or fail.'
      );
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: env.getEnv('GOOGLE_FLIGHTS_API_TIMEOUT_MS', 30000, 'number'), // 30 seconds timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Axios interceptors for logging and potentially adding API key/auth
    this.client.interceptors.request.use(
      (config) => {
        // Add API key as a query parameter (common for Google APIs if not using OAuth)
        if (this.apiKey) {
          config.params = { ...config.params, key: this.apiKey };
        }
        logger.info(`GoogleFlightsAPI Request: ${config.method.toUpperCase()} ${config.url}`, { params: config.params, data: config.data });
        return config;
      },
      (error) => {
        logger.error('GoogleFlightsAPI Request Interceptor Error', { error: error.message });
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.info(`GoogleFlightsAPI Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        // Log the full error structure for better debugging
        logger.error('GoogleFlightsAPI Response Interceptor Error', {
          message: error.message,
          status: error.response?.status,
          url: error.config?.url,
          responseData: error.response?.data,
          requestData: error.config?.data,
          requestParams: error.config?.params,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Formats the application's search parameters into a hypothetical Google Flights API request body.
   * This is highly speculative as no public Google Flights search API exists.
   * @param {object} searchParams - User's search parameters.
   *   Expected: origin (IATA), destination (IATA), departureDate (YYYY-MM-DD),
   *             [returnDate (YYYY-MM-DD)], [adults=1], [children=0], [infantsInLap=0],
   *             [cabin='ECONOMY'], [currency='USD'], [maxResults=10]
   * @returns {object} Google Flights API compatible request body.
   */
  _formatRequest(searchParams) {
    const slices = [
      {
        origin: searchParams.origin,
        destination: searchParams.destination,
        date: searchParams.departureDate,
      },
    ];

    if (searchParams.returnDate) {
      slices.push({
        origin: searchParams.destination,
        destination: searchParams.origin,
        date: searchParams.returnDate,
      });
    }
    
    const cabinMap = { // Map our cabin types to hypothetical Google cabin types
        ECONOMY: 'COACH',
        PREMIUM_ECONOMY: 'PREMIUM_COACH',
        BUSINESS: 'BUSINESS',
        FIRST: 'FIRST'
    };
    const googleCabin = searchParams.cabin ? (cabinMap[searchParams.cabin.toUpperCase()] || 'COACH') : 'COACH';

    return {
      // This structure is purely hypothetical for a Google Flights API
      request: {
        slice: slices,
        passengers: {
          adultCount: parseInt(searchParams.adults, 10) || 1,
          childCount: parseInt(searchParams.children, 10) || 0,
          infantInLapCount: parseInt(searchParams.infantsInLap, 10) || 0,
        },
        maxPrice: searchParams.maxPrice ? `${searchParams.currency || 'USD'}${searchParams.maxPrice}` : undefined,
        solutions: parseInt(searchParams.maxResults, 10) || 10, // Number of itineraries to return
        saleCountry: searchParams.saleCountry || 'US', // Example, might be needed
        ticketingCountry: searchParams.ticketingCountry || 'US', // Example
        currencyCode: searchParams.currency || 'USD',
        cabinRestriction: [{ cabin: googleCabin }]
      },
    };
  }

  /**
   * Transforms the hypothetical Google Flights API response into our application's standard format.
   * @param {object} googleResponseData - Raw data from the hypothetical Google Flights API.
   * @param {object} originalSearchParams - The original search parameters.
   * @returns {Array<object>} Array of standardized flight offers.
   */
  _formatResponse(googleResponseData, originalSearchParams) {
    // Assuming googleResponseData.tripOption is an array of flight solutions
    // This structure is based on common patterns in flight APIs like QPX Express (which was retired)
    const tripOptions = googleResponseData?.solutions?.tripOption || [];
    const formattedOffers = [];

    tripOptions.forEach((option, index) => {
      const offerId = option.id || `gflight-${Date.now()}-${index}`;
      const priceInfo = option.pricing?.[0]; // Assuming pricing is an array with one main pricing option

      if (!priceInfo || !priceInfo.saleTotal) {
          logger.warn(`Skipping trip option due to missing pricing info: ${offerId}`, { option });
          return; // Skip if no pricing
      }
      
      // Attempt to parse price and currency
      const saleTotalMatch = priceInfo.saleTotal.match(/([A-Z]{3})?([\d,.]+)/);
      const currencyCode = saleTotalMatch?.[1] || originalSearchParams.currency || 'USD';
      const totalPrice = parseFloat(saleTotalMatch?.[2]?.replace(/,/g, '')) || 0;

      const baseFareMatch = priceInfo.baseFareTotal?.match(/([A-Z]{3})?([\d,.]+)/);
      const basePrice = baseFareMatch ? parseFloat(baseFareMatch[2]?.replace(/,/g, '')) : undefined;

      const taxMatch = priceInfo.saleTaxTotal?.match(/([A-Z]{3})?([\d,.]+)/);
      const taxPrice = taxMatch ? parseFloat(taxMatch[2]?.replace(/,/g, '')) : undefined;


      const itineraries = (option.slice || []).map((slice, sliceIndex) => {
        const segments = (slice.segment || []).map(seg => {
          const leg = seg.leg?.[0]; // Assuming leg is an array and we take the first
          if (!leg) return null;

          return {
            id: seg.id || `${offerId}-s${sliceIndex}-leg${leg.id || Date.now()}`,
            departure: {
              iataCode: leg.origin,
              terminal: leg.originTerminal,
              at: leg.departureTime, // Expected ISO 8601 format
            },
            arrival: {
              iataCode: leg.destination,
              terminal: leg.destinationTerminal,
              at: leg.arrivalTime, // Expected ISO 8601 format
            },
            carrier: {
              code: seg.flight?.carrier, // Airline code (e.g., "AA")
              // name: carrierData[seg.flight.carrier]?.name || seg.flight.carrier // Need a carrier mapping
            },
            flightNumber: seg.flight?.number,
            aircraft: { code: leg.aircraft }, // Aircraft type code
            duration: leg.duration ? `PT${Math.floor(leg.duration / 60)}H${leg.duration % 60}M` : undefined, // Convert minutes to ISO duration
            cabin: seg.cabin || originalSearchParams.cabin?.toUpperCase() || 'ECONOMY',
            bookingClass: seg.bookingCode, // Fare booking class
            numberOfStops: leg.connectionDuration ? 1 : 0, // Simplistic stop count based on connection
          };
        }).filter(Boolean); // Remove any null segments

        return {
          duration: slice.duration ? `PT${Math.floor(slice.duration / 60)}H${slice.duration % 60}M` : undefined,
          segments: segments,
        };
      });

      formattedOffers.push({
        id: offerId,
        provider: 'GoogleFlights', // Identify the source
        type: 'flight-offer',
        price: {
          total: totalPrice,
          currency: currencyCode,
          base: basePrice,
          taxes: taxPrice,
          grandTotal: totalPrice, // For compatibility with some existing structures
        },
        itineraries: itineraries,
        travelerPricings: [{ // Simplified pricing per traveler
            travelerId: '1', // Assuming one adult for simplicity here
            fareOption: 'STANDARD',
            travelerType: 'ADULT',
            price: {
                currency: currencyCode,
                total: totalPrice,
                base: basePrice,
            }
        }],
        // Other fields like baggage allowance, fare basis would need specific mapping from hypothetical API
        // lastTicketingDate: priceInfo.latestTicketingTime,
      });
    });

    return formattedOffers;
  }

  /**
   * Handles API errors from the hypothetical Google Flights API.
   * Throws an AppError for standardized error handling.
   * @param {Error} error - The error object from Axios.
   * @param {string} context - Context of the error (e.g., 'search').
   */
  _handleApiError(error, context = 'search') {
    let statusCode = 500;
    let message = `Google Flights API request failed during ${context}.`;
    let operational = false;
    let providerErrors = null;

    if (error.response) {
      statusCode = error.response.status;
      const responseData = error.response.data;
      message = responseData?.error?.message || `Google Flights API Error (Status ${statusCode}) during ${context}.`;
      providerErrors = responseData?.error?.errors || (responseData?.error ? [responseData.error] : null);

      switch (statusCode) {
        case 400: // Bad Request
          message = `Invalid request to Google Flights API: ${message}`;
          operational = true;
          break;
        case 401: // Unauthorized
        case 403: // Forbidden
          message = `Authentication/Authorization error with Google Flights API: ${message}`;
          operational = true; // Could be bad API key
          break;
        case 429: // Too Many Requests
          message = `Rate limit exceeded with Google Flights API: ${message}`;
          operational = true;
          break;
        default:
          operational = false; // Server-side errors are not typically operational from client's perspective
      }
    } else if (error.request) {
      message = `No response received from Google Flights API during ${context}. Check network connectivity.`;
      statusCode = 504; // Gateway Timeout
    } else {
      message = `Error setting up request to Google Flights API during ${context}: ${error.message}`;
    }
    // Log the original error for internal debugging
    logger.error(`GoogleFlightsService Error (${context}):`, { originalError: error.message, status: statusCode, details: providerErrors });
    throw new AppError(message, statusCode, operational, providerErrors);
  }

  /**
   * Searches for flights using the hypothetical Google Flights API.
   * Uses caching to store and retrieve results.
   * @param {object} searchParams - Parameters for flight search.
   * @returns {Promise<object>} Standardized flight search results.
   */
  async searchFlights(searchParams) {
    if (!this.apiKey) {
      logger.error('GoogleFlightsService: API Key is not configured. Cannot perform search.');
      // Fallback to empty results or throw specific error
      // Consistent with other services, throw an AppError
      throw new AppError('Google Flights API Key not configured. Flight search unavailable.', 503, true);
    }

    // The function to be cached
    const fetchFromApi = async (params) => {
      try {
        const requestBody = this._formatRequest(params);
        // Assuming the hypothetical Google Flights API uses POST for search
        // The API key is typically added as a query param `?key=YOUR_API_KEY` by an interceptor or directly
        const response = await this.client.post('/flights/search', requestBody.request); // Hypothetical endpoint

        const formattedFlights = this._formatResponse(response.data, params);
        return { // Standardized success response structure
          success: true,
          searchParams: params,
          results: {
            flights: formattedFlights,
            totalResults: formattedFlights.length,
          },
          meta: {
            currency: params.currency || 'USD',
            searchTime: new Date().toISOString(),
            provider: 'GoogleFlights',
          },
        };
      } catch (error) {
        // If error is already AppError from _handleApiError, rethrow it
        if (error instanceof AppError) throw error;
        // Otherwise, wrap it
        this._handleApiError(error, `searchFlights with params: ${JSON.stringify(params).substring(0,100)}`);
        // _handleApiError throws, so this line might not be reached unless it's modified
        return { success: false, message: error.message, results: { flights: [], totalResults: 0 } };
      }
    };

    try {
      // Use cacheService.wrap to handle caching
      return await cacheService.wrap(
        CACHE_TYPE_GOOGLE_FLIGHTS,
        searchParams,
        fetchFromApi,
        DEFAULT_CACHE_TTL_GOOGLE_FLIGHTS
      );
    } catch (error) {
      // Log and rethrow or return a standardized error structure
      logger.error('GoogleFlightsService searchFlights wrapper failed:', { errorMessage: error.message, searchParams });
      // If it's an AppError, it already has good structure
      if (error instanceof AppError) {
        return { success: false, message: error.message, errors: error.errors, status: error.statusCode, results: { flights: [], totalResults: 0 } };
      }
      // For other errors, create a generic failure response
      return {
        success: false,
        message: error.message || 'An unexpected error occurred during flight search.',
        status: 500,
        results: { flights: [], totalResults: 0 },
        meta: { provider: 'GoogleFlights', searchTime: new Date().toISOString() }
      };
    }
  }

  /**
   * Gets the operational status of the service.
   * @returns {object} Service status.
   */
  getStatus() {
    return {
      service: 'GoogleFlightsService',
      status: this.apiKey ? 'configured_and_operational' : 'api_key_not_configured',
      baseURL: this.baseURL,
      apiKeySet: !!this.apiKey,
      notes: "This service integrates with a *hypothetical* Google Flights Data API. The actual Google Flights product does not offer such a public search API for general third-party use.",
    };
  }
}

module.exports = GoogleFlightsService;
