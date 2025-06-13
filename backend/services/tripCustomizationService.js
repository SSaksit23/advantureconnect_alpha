// backend/services/tripCustomizationService.js
/**
 * Trip Customization Service
 * Orchestrates calls to various specialized services (flights, hotels, activities, etc.)
 * to create comprehensive travel packages. It also handles direct calls for supplementary
 * services like weather and currency conversion, applying caching where appropriate.
 */

const axios = require('axios'); // Keep for direct calls like weather, currency
const winston = require('winston');
const env = require('../config/env');
const cacheService = require('./cacheService');
const { AppError } = require('../utils/responseHandler');

// Import specialized API services
const FlightApiService = require('./flightApiService'); // Assumes this service handles its own caching
const HotelApiService = require('./hotelApiService');   // Assumes this service handles its own caching
const ActivityApiService = require('./activityApiService'); // Assumes this service handles its own caching

// Configure logger
const logger = winston.createLogger({
  level: env.getEnv('LOG_LEVEL', 'info'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'trip-customization-service' },
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

const CACHE_TYPE_WEATHER = 'weather_forecast';
const CACHE_TYPE_CURRENCY = 'currency_rates';
const DEFAULT_CACHE_TTL_WEATHER = env.getEnv('CACHE_WEATHER_TTL_SECONDS', 3 * 60 * 60, 'number'); // 3 hours
const DEFAULT_CACHE_TTL_CURRENCY = env.getEnv('CACHE_CURRENCY_TTL_SECONDS', 24 * 60 * 60, 'number'); // 24 hours

class TripCustomizationService {
  constructor(amadeusSdkClient = null) { // Allow passing Amadeus SDK for specialized services
    this.flightApi = new FlightApiService(); // FlightAPI.io or similar
    // Pass the Amadeus SDK client to services that use it
    this.hotelApi = new HotelApiService(amadeusSdkClient);
    this.activityApi = new ActivityApiService(amadeusSdkClient);

    // Direct Axios client for weather and currency (can be refactored into own services later if complex)
    this.weatherApiKey = env.OPENWEATHER_API_KEY;
    this.weatherApiBaseURL = 'https://api.openweathermap.org/data/2.5';
    
    this.currencyApiBaseURL = 'https://api.exchangerate-api.com/v4/latest'; // Example, can be configured
    this.currencyApiFallbackRates = { // Fallback if API fails
        'USD': 1.0, 'EUR': 0.92, 'GBP': 0.79, 'JPY': 157.0, 'CAD': 1.37,
        'AUD': 1.50, 'CHF': 0.89, 'CNY': 7.25, 'INR': 83.5, 'THB': 36.7,
    };

    if (!this.weatherApiKey) {
      logger.warn('OPENWEATHER_API_KEY not set. Weather data will use mock fallbacks or fail.');
    }
    // No API key needed for the example exchangerate-api.com free tier
  }

  /**
   * Orchestrates the creation of a comprehensive trip package.
   * @param {Object} tripParams - Trip parameters from the user/frontend.
   *   Expected: origin, destinations (array of city codes/names), startDate, endDate,
   *             travelers ({ adults, children, infants }), budget, preferences, currency.
   * @returns {Promise<Object>} - Complete trip package with flights, hotels, activities, etc.
   */
  async createTripPackage(tripParams) {
    const {
      origin, // Assuming IATA code
      destinations, // Array of destination objects { cityCode, name, durationDays } or just city codes
      startDate, // YYYY-MM-DD
      endDate,   // YYYY-MM-DD
      travelers, // { adults: 1, children: 0, infants: 0, cabinClass: 'ECONOMY' }
      budget,    // { amount: 1000, currency: 'USD' }
      preferences, // { interests: ['culture'], travelStyle: 'balanced', pace: 'medium' }
      currency = 'USD'
    } = tripParams;

    logger.info('Creating trip package with orchestrator', { tripParams });

    try {
      // 1. Search for flights (multi-leg if multiple destinations)
      // This needs more sophisticated logic for multi-destination trips.
      // For now, let's assume a primary flight search based on first/last destination.
      const primaryDestination = destinations[0]?.cityCode || destinations[0]; // Assuming destinations is array of objects or strings
      const lastDestination = destinations[destinations.length - 1]?.cityCode || destinations[destinations.length - 1];
      
      const flightSearchParams = {
        origin: origin,
        destination: primaryDestination, // Main destination for initial flight leg
        departureDate: startDate,
        returnDate: destinations.length === 1 ? endDate : undefined, // Only set returnDate for single destination trips
        adults: travelers.adults,
        children: travelers.children,
        infants: travelers.infants,
        cabinClass: travelers.cabinClass || 'ECONOMY',
        currency: currency,
      };
      // If multi-destination, additional flight legs would be searched between destinations.
      // This part needs significant expansion for true multi-city flight planning.

      const flightOptions = await this.searchFlights(flightSearchParams);

      // 2. Search for hotels in each destination
      // This requires iterating through destinations and their respective stay dates.
      const hotelOptionsPerDestination = await Promise.all(
        destinations.map(async (dest, index) => {
          const destCityCode = dest.cityCode || dest; // Handle string array or object array
          const checkIn = this._calculateDate(startDate, dest.arrivalDayOffset || (index * (dest.durationDays || 2) )); // Simplified date logic
          const checkOut = this._calculateDate(checkIn, dest.durationDays || 2); // Simplified duration
          
          return this.searchHotels({
            cityCode: destCityCode,
            checkInDate: checkIn,
            checkOutDate: checkOut,
            adults: travelers.adults,
            currency: currency,
            // Add other hotel params like ratings, amenities from preferences
          });
        })
      );
      const hotelOptions = hotelOptionsPerDestination.flat(); // Flatten results if searchHotels returns arrays

      // 3. Search for activities and POIs in each destination
      const activityOptionsPerDestination = await Promise.all(
        destinations.map(dest => {
          const destCityCode = dest.cityCode || dest;
          // Need geo-coordinates for Amadeus activity search. This requires a lookup.
          // For now, assuming we can search by city name/code or have coordinates.
          // This might require a preliminary location lookup service.
          logger.warn(`Activity search for ${destCityCode} needs coordinates. Placeholder logic.`);
          // Example: await this.activityApi.searchActivitiesByCoordinates({ latitude, longitude, radius: 10 });
          return this.searchActivities({ destination: destCityCode, preferences });
        })
      );
      const activityOptions = activityOptionsPerDestination.flat();

      // 4. Get weather information for primary destination
      const weatherInfo = await this.getWeatherForecast({ destination: primaryDestination, startDate, endDate });

      // 5. Get currency conversion rates if needed (e.g., budget currency vs. destination currency)
      const currencyRates = await this.getCurrencyRates(budget?.currency || currency);

      // 6. Assemble and price the package (this is complex logic)
      const tripPackages = this._assembleTripPackages({
        flightOptions,
        hotelOptions,
        activityOptions,
        weatherInfo,
        currencyRates,
        budget,
        currency,
        preferences
      });

      return {
        success: true,
        data: {
          tripPackages, // Array of assembled package options
          // Raw components for detailed view:
          // flightOptions,
          // hotelOptions,
          // activityOptions,
          // weatherInfo,
          // currencyRates,
          searchParams: tripParams
        },
        meta: {
          searchTime: new Date().toISOString(),
          currency,
        }
      };

    } catch (error) {
      logger.error('Error creating trip package via orchestrator', { error: error.message, stack: error.stack });
      if (error instanceof AppError) throw error;
      throw new AppError('Trip package creation failed due to an internal error.', 500);
    }
  }
  
  _calculateDate(baseDate, offsetDays) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() + offsetDays);
      return date.toISOString().split('T')[0];
  }

  async searchFlights(params) {
    logger.info('TripCustomizationService: Delegating flight search to FlightApiService', { params });
    try {
      // FlightApiService is expected to handle its own caching and error formatting
      return await this.flightApi.searchFlights(params);
    } catch (error) {
      logger.error('TripCustomizationService: Flight search failed.', { error: error.message });
      // Return a consistent error structure or re-throw AppError
      throw new AppError(error.message || 'Flight search failed.', error.status || 500, true, error.details);
    }
  }

  async searchHotels(params) {
    logger.info('TripCustomizationService: Delegating hotel search to HotelApiService', { params });
    try {
      // HotelApiService is expected to handle its own caching and error formatting
      return await this.hotelApi.searchHotelsByCity(params); // Or other relevant method
    } catch (error) {
      logger.error('TripCustomizationService: Hotel search failed.', { error: error.message });
      throw new AppError(error.message || 'Hotel search failed.', error.status || 500, true, error.details);
    }
  }

  async searchActivities(params) {
    logger.info('TripCustomizationService: Delegating activity search to ActivityApiService', { params });
    // ActivityApiService needs coordinates. This is a simplification.
    // In a real app, you'd get coordinates for the destination first.
    const mockCoordinates = { latitude: 48.8566, longitude: 2.3522 }; // Paris
    try {
      return await this.activityApi.searchActivitiesByCoordinates({
        latitude: params.latitude || mockCoordinates.latitude,
        longitude: params.longitude || mockCoordinates.longitude,
        radius: params.radius || 10,
        // startDate, endDate if API supports it
      });
    } catch (error) {
      logger.error('TripCustomizationService: Activity search failed.', { error: error.message });
      throw new AppError(error.message || 'Activity search failed.', error.status || 500, true, error.details);
    }
  }

  async getWeatherForecast({ destination, startDate, endDate }) {
    if (!this.weatherApiKey) {
      logger.warn('Weather API key not set. Returning mock weather data.');
      return this._createMockWeather(destination, startDate, endDate);
    }

    // For OpenWeatherMap, forecast usually needs lat/lon.
    // This is a simplified example; a real implementation would look up coords for 'destination'.
    // Using a placeholder for coordinates.
    const mockCoords = { lat: 48.85, lon: 2.35 }; // Paris
    const cacheParams = { destinationName: destination, lat: mockCoords.lat, lon: mockCoords.lon, startDate, endDate };
    
    const fetchFn = async () => {
      try {
        // Example: 5-day/3-hour forecast (free tier)
        // A more complex implementation would fetch daily for longer ranges if API supports.
        const response = await axios.get(`${this.weatherApiBaseURL}/forecast`, {
          params: {
            lat: mockCoords.lat,
            lon: mockCoords.lon,
            appid: this.weatherApiKey,
            units: 'metric', // Or 'imperial'
          },
          timeout: env.getEnv('WEATHER_API_TIMEOUT_MS', 10000, 'number'),
        });
        // Format response.data.list into a daily summary
        return this._formatWeatherData(response.data, destination, startDate, endDate);
      } catch (error) {
        logger.error('Weather forecast API error', { error: error.message, destination });
        // Fallback to mock data on API failure
        return this._createMockWeather(destination, startDate, endDate, true); // Mark as fallback
      }
    };
    return cacheService.wrap(CACHE_TYPE_WEATHER, cacheParams, fetchFn, DEFAULT_CACHE_TTL_WEATHER);
  }
  
  _formatWeatherData(apiData, destination, startDate, endDate) {
      // Basic formatting: extract daily summaries from OpenWeatherMap 3-hour forecast
      const dailyForecasts = {};
      (apiData.list || []).forEach(item => {
          const date = item.dt_txt.split(' ')[0];
          if (!dailyForecasts[date]) {
              dailyForecasts[date] = {
                  temps: [],
                  conditions: [],
                  icons: [],
                  humidity: [],
                  wind: [],
              };
          }
          dailyForecasts[date].temps.push(item.main.temp);
          dailyForecasts[date].conditions.push(item.weather[0].description);
          dailyForecasts[date].icons.push(item.weather[0].icon);
          dailyForecasts[date].humidity.push(item.main.humidity);
          dailyForecasts[date].wind.push(item.wind.speed);
      });
      
      const formatted = Object.keys(dailyForecasts).map(date => ({
          date: date,
          temp_min: Math.min(...dailyForecasts[date].temps),
          temp_max: Math.max(...dailyForecasts[date].temps),
          condition: dailyForecasts[date].conditions[Math.floor(dailyForecasts[date].conditions.length / 2)], // Mid-day condition
          icon: `http://openweathermap.org/img/wn/${dailyForecasts[date].icons[Math.floor(dailyForecasts[date].icons.length / 2)]}@2x.png`,
          humidity_avg: dailyForecasts[date].humidity.reduce((a,b) => a+b,0) / dailyForecasts[date].humidity.length,
          wind_avg_kph: (dailyForecasts[date].wind.reduce((a,b) => a+b,0) / dailyForecasts[date].wind.length) * 3.6, // m/s to kph
      }));

      return {
          destination,
          forecast: formatted.filter(f => f.date >= startDate && f.date <= endDate), // Filter by trip dates
          summary: `Weather forecast for ${destination}.`,
          isFallback: false,
      };
  }

  async getCurrencyRates(baseCurrency = 'USD') {
    const cacheParams = { base: baseCurrency };
    const fetchFn = async () => {
      try {
        const response = await axios.get(`${this.currencyApiBaseURL}/${baseCurrency}`, {
            timeout: env.getEnv('CURRENCY_API_TIMEOUT_MS', 5000, 'number'),
        });
        return {
          base: response.data.base_code || response.data.base,
          rates: response.data.rates,
          last_updated_unix: response.data.time_last_update_unix || response.data.time_last_updated,
          isFallback: false,
        };
      } catch (error) {
        logger.error('Currency conversion API error', { error: error.message, baseCurrency });
        return { // Fallback to static rates
          base: baseCurrency,
          rates: this.currencyApiFallbackRates,
          last_updated_unix: Math.floor(Date.now() / 1000),
          isFallback: true,
        };
      }
    };
    return cacheService.wrap(CACHE_TYPE_CURRENCY, cacheParams, fetchFn, DEFAULT_CACHE_TTL_CURRENCY);
  }

  /**
   * Assembles different trip packages based on fetched options and budget.
   * This is a complex piece of logic that would typically involve:
   * - Filtering options based on preferences (e.g., direct flights, hotel ratings).
   * - Combining components into viable packages.
   * - Pricing packages and comparing against budget.
   * - Potentially using AI/rules to create "budget", "standard", "luxury" options.
   * For now, this is a simplified placeholder.
   */
  _assembleTripPackages({ flightOptions, hotelOptions, activityOptions, weatherInfo, currencyRates, budget, currency, preferences }) {
    logger.info('Assembling trip packages (simplified logic)...');
    // This is where sophisticated package creation logic would go.
    // For this example, let's just create one representative package.
    
    const selectedFlight = flightOptions?.results?.flights?.[0];
    const selectedHotel = hotelOptions?.[0]?.results?.hotels?.[0]; // Assuming hotelOptions is an array of search results per destination
    const selectedActivity = activityOptions?.[0]?.results?.items?.[0];

    let totalPrice = 0;
    if (selectedFlight) totalPrice += selectedFlight.price?.total || 0;
    if (selectedHotel) totalPrice += selectedHotel.offerDetails?.price?.total || selectedHotel.price?.perNight || 0; // Adjust based on hotel structure
    if (selectedActivity) totalPrice += selectedActivity.price?.amount || 0;
    
    const mainPackage = {
      id: 'package_main_01',
      name: `Curated Trip to ${preferences?.primaryDestination || 'Your Destination'}`,
      description: 'A balanced trip package with good value flights, comfortable hotels, and exciting activities.',
      totalPrice: parseFloat(totalPrice.toFixed(2)),
      currency: currency,
      components: [],
      matchesBudget: budget?.amount ? totalPrice <= budget.amount : true,
    };

    if (selectedFlight) mainPackage.components.push({ type: 'flight', details: selectedFlight });
    if (selectedHotel) mainPackage.components.push({ type: 'hotel', details: selectedHotel });
    if (selectedActivity) mainPackage.components.push({ type: 'activity', details: selectedActivity });
    
    // Add weather and currency info to package meta or directly
    mainPackage.weatherForecast = weatherInfo;
    mainPackage.currencyInfo = currencyRates;

    return [mainPackage]; // Return array of packages
  }

  // --- Mock Data Fallbacks (to be used if API keys missing or APIs fail) ---
  _createMockWeather(destination, startDate, endDate, isApiFallback = false) {
    const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain', 'Clear'];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

    return {
      destination,
      forecast: Array.from({ length: days }, (_, i) => {
        const date = new Date(start);
        date.setDate(date.getDate() + i);
        return {
          date: date.toISOString().split('T')[0],
          condition: conditions[Math.floor(Math.random() * conditions.length)],
          temp_min: Math.floor(Math.random() * 10) + 10, // 10-19 C
          temp_max: Math.floor(Math.random() * 10) + 20, // 20-29 C
          icon: 'mock_icon_url', // Placeholder
        };
      }),
      summary: `Mock weather for ${destination}.`,
      isFallback: true,
      isApiFallback,
    };
  }

  getStatus() {
    return {
      service: 'Trip Customization Service (Orchestrator)',
      status: 'operational',
      dependencies: {
        flightApi: this.flightApi.getStatus(),
        hotelApi: this.hotelApi.getStatus(),
        activityApi: this.activityApi.getStatus(),
        weatherApi: this.weatherApiKey ? 'configured' : 'not_configured (using mocks)',
        currencyApi: 'configured (using public API with fallbacks)',
        cacheService: cacheService.redisAvailable ? 'Redis available' : 'Redis unavailable (DB cache only or no cache)',
      },
      notes: 'Orchestrates various travel services to build trip packages. Uses caching for weather and currency.',
    };
  }
}

module.exports = TripCustomizationService;
