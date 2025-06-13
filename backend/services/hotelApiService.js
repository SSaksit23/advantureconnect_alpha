// backend/services/hotelApiService.js
const axios = require('axios');
const winston = require('winston');
const qs = require('qs');
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
  defaultMeta: { service: 'hotel-api-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    // Add file transports if needed
  ],
});

const AMADEUS_TEST_HOSTNAME = 'test.api.amadeus.com';
const AMADEUS_PROD_HOSTNAME = 'api.amadeus.com';

const CACHE_TYPE_HOTEL_SEARCH = 'amadeus_hotel_search';
const CACHE_TYPE_HOTEL_OFFERS = 'amadeus_hotel_offers';
const CACHE_TYPE_HOTEL_PRICING = 'amadeus_hotel_pricing';

const DEFAULT_CACHE_TTL_HOTEL_SEARCH = env.getEnv('CACHE_AMADEUS_HOTEL_SEARCH_TTL_SECONDS', 15 * 60, 'number'); // 15 minutes
const DEFAULT_CACHE_TTL_HOTEL_OFFERS = env.getEnv('CACHE_AMADEUS_HOTEL_OFFERS_TTL_SECONDS', 10 * 60, 'number'); // 10 minutes
const DEFAULT_CACHE_TTL_HOTEL_PRICING = env.getEnv('CACHE_AMADEUS_HOTEL_PRICING_TTL_SECONDS', 1 * 60, 'number');   // 1 minute (prices change fast)

class HotelApiService {
  constructor(amadeusSdkClient = null) {
    this.clientId = env.AMADEUS_CLIENT_ID;
    this.clientSecret = env.AMADEUS_CLIENT_SECRET;
    this.hostname = env.AMADEUS_HOSTNAME === 'production' ? AMADEUS_PROD_HOSTNAME : AMADEUS_TEST_HOSTNAME;
    
    this.amadeusSdkClient = amadeusSdkClient;

    this.accessToken = null;
    this.tokenExpiry = null;

    if (!this.clientId || !this.clientSecret) {
      logger.warn(
        'Amadeus API Client ID or Secret is not configured. HotelApiService will not be able to make direct requests if SDK client is not provided.'
      );
    }
    
    if (!this.amadeusSdkClient) {
        this.client = axios.create({
          baseURL: `https://${this.hostname}`,
          timeout: env.getEnv('AMADEUS_API_TIMEOUT_MS', 30000, 'number'),
        });
    
        this.client.interceptors.request.use(
          async (config) => {
            if (!config.url.includes('/v1/security/oauth2/token')) { // Don't add auth header to token request itself
              await this._ensureValidToken(); // Ensure token is valid before request
              config.headers.Authorization = `Bearer ${this.accessToken}`;
            }
            logger.info(`Amadeus Hotel API Request: ${config.method.toUpperCase()} ${config.baseURL}${config.url}`, { params: config.params, data: config.data });
            return config;
          },
          (error) => {
            logger.error('Amadeus Hotel API Request Interceptor Error', { error: error.message });
            return Promise.reject(error);
          }
        );
    
        this.client.interceptors.response.use(
          (response) => {
            logger.info(`Amadeus Hotel API Response: ${response.status} ${response.config.url}`);
            return response;
          },
          (error) => {
            logger.error('Amadeus Hotel API Response Interceptor Error', {
              status: error.response?.status,
              message: error.message,
              url: error.config?.url,
              responseData: error.response?.data,
            });
            return Promise.reject(error);
          }
        );
    } else {
        logger.info('HotelApiService initialized with pre-configured Amadeus SDK client.');
    }
  }

  async _ensureValidToken() {
    if (!this.accessToken || !this.tokenExpiry || this.tokenExpiry <= Date.now()) {
      await this._getAccessToken();
    }
  }

  async _getAccessToken() {
    if (!this.clientId || !this.clientSecret) {
      throw new AppError('Amadeus client ID or secret not configured for token fetching.', 500, true);
    }

    logger.info('Fetching new Amadeus access token for Hotel service...');
    try {
      const response = await axios.post( // Use axios directly for token, not this.client to avoid interceptor loop
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
          timeout: env.getEnv('AMADEUS_TOKEN_TIMEOUT_MS', 10000, 'number'),
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000; // Buffer
      logger.info('Successfully fetched new Amadeus access token for Hotel service.');
      return this.accessToken;
    } catch (error) {
      const errorDetails = this._parseAmadeusError(error, 'token_fetch');
      logger.error('Failed to fetch Amadeus access token for Hotel service', errorDetails);
      throw new AppError(errorDetails.message, errorDetails.status, true, errorDetails.providerErrors);
    }
  }

  _parseAmadeusError(error, context = 'general') {
    const errorResponse = {
      message: `An unexpected error occurred with the Amadeus Hotel API during ${context}.`,
      providerErrors: [],
      status: 500,
    };

    if (error.response) {
      errorResponse.status = error.response.status;
      errorResponse.message = `Amadeus Hotel API request failed with status ${error.response.status} during ${context}.`;
      if (error.response.data && error.response.data.errors) {
        errorResponse.providerErrors = error.response.data.errors.map(e => ({
          code: e.code,
          title: e.title,
          detail: e.detail,
          status: e.status,
          source: e.source,
        }));
        if (errorResponse.providerErrors.length > 0) {
          errorResponse.message = errorResponse.providerErrors[0].title || errorResponse.providerErrors[0].detail || errorResponse.message;
        }
      } else if (error.response.data && (error.response.data.error_description || error.response.data.error)) { // For OAuth errors
        errorResponse.message = error.response.data.error_description || error.response.data.error;
        errorResponse.providerErrors.push({ title: error.response.data.error, detail: error.response.data.error_description });
      } else if (error.response.data) {
        errorResponse.message = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data).substring(0, 200);
      }
    } else if (error.request) {
      errorResponse.message = `No response received from Amadeus Hotel API during ${context}. Check network connectivity.`;
      errorResponse.status = 504; // Gateway Timeout
    } else {
      errorResponse.message = error.message || `Error setting up request to Amadeus Hotel API during ${context}.`;
    }
    return errorResponse;
  }
  
  _handleApiError(error, context = 'general') {
    const parsedError = this._parseAmadeusError(error, context);
    logger.error(`Amadeus Hotel API Error (${context}):`, { parsedError, originalError: error.message });
    throw new AppError(parsedError.message, parsedError.status, true, parsedError.providerErrors);
  }
  
  _mapAmadeusAmenities(amadeusAmenities = []) {
    if (!Array.isArray(amadeusAmenities)) return [];
    const amenityMapping = {
      WIFI: 'WiFi', PARKING: 'Parking', SWIMMING_POOL: 'Swimming Pool', RESTAURANT: 'Restaurant',
      PETS_ALLOWED: 'Pets Allowed', AIR_CONDITIONING: 'Air Conditioning', FITNESS_CENTER: 'Fitness Center',
      SPA: 'Spa', BAR: 'Bar', AIRPORT_SHUTTLE: 'Airport Shuttle', BUSINESS_CENTER: 'Business Center',
      DISABLED_FACILITIES: 'Disabled Facilities', MEETING_ROOMS: 'Meeting Rooms',
      NO_SMOKING_ROOMS: 'Non-Smoking Rooms', ROOM_SERVICE: 'Room Service', KITCHEN: 'Kitchen/Kitchenette',
      BEACH_ACCESS: 'Beach Access', CONCIERGE_SERVICE: 'Concierge Service', LAUNDRY_SERVICE: 'Laundry Service',
      // Add more mappings as discovered or needed
    };
    return amadeusAmenities.map(code => amenityMapping[code] || code.replace(/_/g, ' ')).slice(0, 7); // Limit for brevity
  }

  _formatHotelOffer(hotel, offer, currency) {
    const hotelAddress = hotel.address || {};
    const fullAddressParts = [
        ...(hotelAddress.lines || []),
        hotelAddress.cityName,
        hotelAddress.postalCode,
        hotelAddress.countryCode
    ].filter(Boolean);

    const offerRoom = offer?.room || {};
    const offerPrice = offer?.price || {};
    const offerPolicies = offer?.policies || {};

    return {
      id: hotel.hotelId,
      providerId: hotel.hotelId,
      name: hotel.name,
      rating: hotel.rating ? parseFloat(hotel.rating) : null,
      chainCode: hotel.chainCode,
      address: {
        lines: hotelAddress.lines,
        cityName: hotelAddress.cityName,
        postalCode: hotelAddress.postalCode,
        countryCode: hotelAddress.countryCode,
        full: fullAddressParts.join(', '),
      },
      coordinates: hotel.geoCode ? {
        latitude: hotel.geoCode.latitude,
        longitude: hotel.geoCode.longitude,
      } : null,
      description: offerRoom.description?.text || hotel.description?.text,
      amenities: this._mapAmadeusAmenities(hotel.amenities),
      images: hotel.media?.map(m => ({ url: m.uri, caption: m.category, type: m.category })) || [],
      contact: hotel.contact ? { phone: hotel.contact.phone, email: hotel.contact.email } : null,
      distance: hotel.distance ? { value: hotel.distance.value, unit: hotel.distance.unit } : null,
      provider: 'Amadeus',
      // Offer specific details are nested if an offer is provided
      ...(offer && {
        offerDetails: {
            offerId: offer.id,
            checkInDate: offer.checkInDate,
            checkOutDate: offer.checkOutDate,
            room: {
              type: offerRoom.typeEstimated?.category || offerRoom.type,
              description: offerRoom.description?.text,
              bedType: offerRoom.typeEstimated?.bedType,
              beds: offerRoom.typeEstimated?.beds,
            },
            guests: offer.guests,
            price: {
              total: parseFloat(offerPrice.total || offerPrice.grandTotal || 0),
              currency: offerPrice.currency || currency,
              base: parseFloat(offerPrice.base) || undefined,
              taxesAndFees: offerPrice.taxes?.reduce((sum, tax) => sum + parseFloat(tax.amount || 0), 0) || undefined,
              variations: offerPrice.variations,
            },
            cancellationPolicy: offerPolicies.cancellations?.[0]?.description?.text || offerPolicies.cancellations?.[0]?.deadline || 'Refer to booking conditions',
            boardType: offer.boardType, // e.g., ROOM_ONLY, BREAKFAST
            lastBookingDate: offerPrice.sellingTotal?.deadline,
            isAvailable: offer.available !== false,
        }
      })
    };
  }
  
  _formatHotelListResponse(amadeusData, originalParams) {
    const hotelsWithOffers = amadeusData.data || [];
    const formattedHotels = hotelsWithOffers.map(hotelEntry => {
      const representativeOffer = hotelEntry.offers?.[0]; // Pick the first offer as representative
      return this._formatHotelOffer(hotelEntry.hotel, representativeOffer, originalParams.currency || 'USD');
    });

    return {
      success: true,
      searchParams: originalParams,
      results: {
        hotels: formattedHotels,
        totalResults: amadeusData.meta?.count || formattedHotels.length,
        pagination: amadeusData.meta?.page || amadeusData.meta?.links || null, 
      },
      meta: {
        currency: originalParams.currency || 'USD',
        searchTime: new Date().toISOString(),
        provider: 'Amadeus',
        dictionaries: amadeusData.dictionaries, // Pass through Amadeus dictionaries if present
      },
    };
  }

  _formatSingleHotelOffersResponse(amadeusData, originalParams) {
    const hotelData = amadeusData.data;
    if (!hotelData || !hotelData.hotel) {
      throw new AppError('Hotel data not found in Amadeus response.', 404, true);
    }

    const hotelBaseInfo = this._formatHotelOffer(hotelData.hotel, null, originalParams.currency || 'USD');
    
    // Map all available offers for this hotel
    const allOffers = (hotelData.offers || []).map(offer => {
      const offerPrice = offer.price || {};
      const offerRoom = offer.room || {};
      const offerPolicies = offer.policies || {};
      return {
        offerId: offer.id,
        checkInDate: offer.checkInDate,
        checkOutDate: offer.checkOutDate,
        room: {
          type: offerRoom.typeEstimated?.category || offerRoom.type,
          description: offerRoom.description?.text,
          bedType: offerRoom.typeEstimated?.bedType,
          beds: offerRoom.typeEstimated?.beds,
        },
        guests: offer.guests,
        price: {
          total: parseFloat(offerPrice.total || offerPrice.grandTotal || 0),
          currency: offerPrice.currency || originalParams.currency || 'USD',
          base: parseFloat(offerPrice.base) || undefined,
          taxesAndFees: offerPrice.taxes?.reduce((sum, tax) => sum + parseFloat(tax.amount || 0), 0) || undefined,
        },
        cancellationPolicy: offerPolicies.cancellations?.[0]?.description?.text || offerPolicies.cancellations?.[0]?.deadline || 'Refer to booking conditions',
        boardType: offer.boardType,
        lastBookingDate: offerPrice.sellingTotal?.deadline,
        isAvailable: offer.available !== false,
      };
    });
    
    return {
      success: true,
      searchParams: originalParams,
      results: {
        hotel: { ...hotelBaseInfo, offers: allOffers }, // Embed all offers within the hotel object
      },
      meta: {
        currency: originalParams.currency || 'USD',
        searchTime: new Date().toISOString(),
        provider: 'Amadeus',
        dictionaries: amadeusData.dictionaries,
      },
    };
  }
  
  _formatConfirmedOfferResponse(amadeusData, originalParams) {
    // Amadeus /v2/shopping/hotel-offers/:offerId can return a single offer or a list with one offer
    // Let's assume it's a single offer structure or we take the first from a list.
    const offerData = Array.isArray(amadeusData.data) ? amadeusData.data[0] : amadeusData.data;
    
    if (!offerData || !offerData.hotel || !offerData.offers || offerData.offers.length === 0) {
      throw new AppError('Confirmed offer data not found or invalid in Amadeus response.', 404, true);
    }

    const hotelInfo = offerData.hotel;
    const confirmedOfferDetails = offerData.offers[0];

    const formattedConfirmedOffer = this._formatHotelOffer(hotelInfo, confirmedOfferDetails, originalParams.currency || 'USD');
    
    return {
      success: true,
      searchParams: originalParams,
      results: {
        confirmedOffer: formattedConfirmedOffer, // The entire hotel object with the specific offer in `offerDetails`
      },
      meta: {
        currency: originalParams.currency || 'USD',
        searchTime: new Date().toISOString(),
        provider: 'Amadeus',
        dictionaries: amadeusData.dictionaries,
      },
    };
  }

  async searchHotelsByCity(params) {
    const {
      cityCode, checkInDate, checkOutDate, adults = 1, roomQuantity = 1,
      ratings, amenities, priceRange, currency = 'USD', lang = 'EN',
      pageLimit = 10, bestRateOnly = true, sort,
    } = params;

    if (!cityCode || !checkInDate || !checkOutDate) {
      throw new AppError('Missing required parameters: cityCode, checkInDate, or checkOutDate.', 400, true);
    }

    const queryParams = {
      cityCode, checkInDate, checkOutDate,
      adults: parseInt(adults, 10),
      roomQuantity: parseInt(roomQuantity, 10),
      currency, lang,
      paymentPolicy: 'NONE', includeClosed: false, bestRateOnly,
      view: 'FULL_ALL_IMAGES', 'page[limit]': parseInt(pageLimit, 10),
    };

    if (ratings && Array.isArray(ratings) && ratings.length > 0) queryParams.ratings = ratings.join(',');
    if (amenities && Array.isArray(amenities) && amenities.length > 0) queryParams.amenities = amenities.join(',');
    if (priceRange) queryParams.priceRange = priceRange; // e.g., "100-300"
    if (sort) queryParams.sort = sort; // e.g., "PRICE", "-PRICE", "DISTANCE", "RATING"

    const fetchFromApi = async (apiParams) => {
      try {
        let response;
        if (this.amadeusSdkClient?.shopping?.hotelOffersSearch) {
          response = await this.amadeusSdkClient.shopping.hotelOffersSearch.get(apiParams);
          return this._formatHotelListResponse(response.result, params);
        } else {
          response = await this.client.get('/v3/shopping/hotel-offers', { params: apiParams });
          return this._formatHotelListResponse(response.data, params);
        }
      } catch (error) {
        this._handleApiError(error, 'searchHotelsByCity');
      }
    };
    
    return cacheService.wrap(CACHE_TYPE_HOTEL_SEARCH, queryParams, fetchFromApi, DEFAULT_CACHE_TTL_HOTEL_SEARCH);
  }

  async getHotelOffersByHotelId(params) {
    const { hotelId, checkInDate, checkOutDate, adults = 1, roomQuantity = 1, currency = 'USD', lang = 'EN' } = params;

    if (!hotelId || !checkInDate || !checkOutDate) {
      throw new AppError('Missing required parameters: hotelId, checkInDate, or checkOutDate.', 400, true);
    }

    const queryParams = {
      hotelId, checkInDate, checkOutDate,
      adults: parseInt(adults, 10),
      roomQuantity: parseInt(roomQuantity, 10),
      currency, lang, paymentPolicy: 'NONE', view: 'FULL_ALL_IMAGES',
    };
    
    const fetchFromApi = async (apiParams) => {
      try {
        let response;
        if (this.amadeusSdkClient?.shopping?.hotelOffersByHotel) {
            response = await this.amadeusSdkClient.shopping.hotelOffersByHotel.get(apiParams);
            return this._formatSingleHotelOffersResponse(response.result, params);
        } else {
            response = await this.client.get('/v3/shopping/hotel-offers/by-hotel', { params: apiParams });
            return this._formatSingleHotelOffersResponse(response.data, params);
        }
      } catch (error) {
        this._handleApiError(error, 'getHotelOffersByHotelId');
      }
    };
    return cacheService.wrap(CACHE_TYPE_HOTEL_OFFERS, queryParams, fetchFromApi, DEFAULT_CACHE_TTL_HOTEL_OFFERS);
  }

  async getHotelOfferPricing(offerId, params = {}) {
    if (!offerId) {
      throw new AppError('Missing required parameter: offerId.', 400, true);
    }
    
    const queryParams = { ...params }; // Add any additional relevant params Amadeus might support for this endpoint
    
    const fetchFromApi = async (apiParams) => {
        try {
          let response;
          if (this.amadeusSdkClient?.shopping?.hotelOffer) { // Amadeus SDK structure might be hotelOffer(offerId).get()
              response = await this.amadeusSdkClient.shopping.hotelOffer(offerId).get(apiParams);
              return this._formatConfirmedOfferResponse(response.result, { offerId, ...params });
          } else {
              response = await this.client.get(`/v2/shopping/hotel-offers/${offerId}`, { params: apiParams });
              return this._formatConfirmedOfferResponse(response.data, { offerId, ...params });
          }
        } catch (error) {
          this._handleApiError(error, `getHotelOfferPricing (offerId: ${offerId})`);
        }
    };
    return cacheService.wrap(CACHE_TYPE_HOTEL_PRICING, { offerId, ...queryParams }, fetchFromApi, DEFAULT_CACHE_TTL_HOTEL_PRICING);
  }

  getStatus() {
    return {
      service: 'HotelApiService (Amadeus)',
      status: (this.clientId && this.clientSecret) || this.amadeusSdkClient ? 'configured' : 'not_configured',
      hostname: this.hostname,
      sdkInUse: !!this.amadeusSdkClient,
      notes: 'Provides hotel search and offer details using Amadeus API. Caching enabled for searches and offer details.',
    };
  }
}

module.exports = HotelApiService;
