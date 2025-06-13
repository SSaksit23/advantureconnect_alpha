import React, { useState } from 'react';
import apiClient from '../../services/apiClient'; // Import the global apiClient

const FlightSearch = ({ onFlightSelect }) => {
  const [searchParams, setSearchParams] = useState({
    origin: '',
    destination: '',
    departureDate: '',
    returnDate: '',
    tripType: 'roundtrip',
    adults: 1
  });

  const [originSuggestions, setOriginSuggestions] = useState([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [showOriginDropdown, setShowOriginDropdown] = useState(false);
  const [showDestinationDropdown, setShowDestinationDropdown] = useState(false);

  // API_BASE_URL is no longer needed here as apiClient is pre-configured

  const searchLocations = async (query, setSuggestions) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    
    try {
      // Use apiClient for the request
      const response = await apiClient.get(`/locations/search?keyword=${encodeURIComponent(query)}`);
      setSuggestions(response.data || []);
    } catch (error) {
      console.error('Error searching locations:', error);
      setSuggestions([]);
    }
  };

  const handleOriginSearch = (e) => {
    const value = e.target.value;
    setSearchParams(prev => ({ ...prev, origin: value }));
    searchLocations(value, setOriginSuggestions);
    setShowOriginDropdown(true);
  };

  const handleDestinationSearch = (e) => {
    const value = e.target.value;
    setSearchParams(prev => ({ ...prev, destination: value }));
    searchLocations(value, setDestinationSuggestions);
    setShowDestinationDropdown(true);
  };

  const selectOrigin = (location) => {
    setSearchParams(prev => ({ ...prev, origin: `${location.city || location.name} (${location.code})` }));
    setOriginSuggestions([]);
    setShowOriginDropdown(false);
  };

  const selectDestination = (location) => {
    setSearchParams(prev => ({ ...prev, destination: `${location.city || location.name} (${location.code})` }));
    setDestinationSuggestions([]);
    setShowDestinationDropdown(false);
  };

  const extractIataCode = (locationString) => {
    const match = locationString.match(/\(([A-Z]{3})\)/);
    return match ? match[1] : '';
  };

  const handleSearch = async () => {
    const originCode = extractIataCode(searchParams.origin);
    const destinationCode = extractIataCode(searchParams.destination);
    
    if (!originCode || !destinationCode || !searchParams.departureDate) {
      alert('Please fill in all required fields');
      return;
    }

    setIsSearching(true);
    
    try {
      const requestBody = {
        originLocationCode: originCode,
        destinationLocationCode: destinationCode,
        departureDate: searchParams.departureDate,
        adults: searchParams.adults
      };

      if (searchParams.tripType === 'roundtrip' && searchParams.returnDate) {
        requestBody.returnDate = searchParams.returnDate;
      }

      // Use apiClient for the POST request
      const response = await apiClient.post(`/flights/search`, requestBody);
      setSearchResults(response.data);
      
      if (onFlightSelect) {
        onFlightSelect({
          destination: destinationCode,
          destinationName: searchParams.destination,
          dates: {
            departure: searchParams.departureDate,
            return: searchParams.returnDate
          }
        });
      }
    } catch (error) {
      console.error('Error searching flights:', error);
      alert('Failed to search flights. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const formatTime = (dateTimeString) => {
    return new Date(dateTimeString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const formatDuration = (duration) => {
    return duration.replace('PT', '').replace('H', 'h ').replace('M', 'm');
  };

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Flight Search</h2>
        
        {/* Trip Type Toggle */}
        <div className="flex space-x-4 mb-6">
          <button
            onClick={() => setSearchParams(prev => ({ ...prev, tripType: 'roundtrip' }))}
            className={`px-4 py-2 rounded-lg font-medium ${
              searchParams.tripType === 'roundtrip'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Round Trip
          </button>
          <button
            onClick={() => setSearchParams(prev => ({ ...prev, tripType: 'oneway' }))}
            className={`px-4 py-2 rounded-lg font-medium ${
              searchParams.tripType === 'oneway'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            One Way
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Origin */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">From</label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-400">📍</span>
              <input
                type="text"
                value={searchParams.origin}
                onChange={handleOriginSearch}
                placeholder="City or airport"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {showOriginDropdown && originSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {originSuggestions.map((location, index) => (
                    <button
                      key={index}
                      onClick={() => selectOrigin(location)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-medium">{location.city || location.name} ({location.code})</div>
                      <div className="text-sm text-gray-500">{location.country}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Destination */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">To</label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-400">📍</span>
              <input
                type="text"
                value={searchParams.destination}
                onChange={handleDestinationSearch}
                placeholder="City or airport"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {showDestinationDropdown && destinationSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {destinationSuggestions.map((location, index) => (
                    <button
                      key={index}
                      onClick={() => selectDestination(location)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-medium">{location.city || location.name} ({location.code})</div>
                      <div className="text-sm text-gray-500">{location.country}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Departure Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Departure</label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-400">📅</span>
              <input
                type="date"
                value={searchParams.departureDate}
                onChange={(e) => setSearchParams(prev => ({ ...prev, departureDate: e.target.value }))}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          {/* Return Date */}
          {searchParams.tripType === 'roundtrip' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Return</label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-gray-400">📅</span>
                <input
                  type="date"
                  value={searchParams.returnDate}
                  onChange={(e) => setSearchParams(prev => ({ ...prev, returnDate: e.target.value }))}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min={searchParams.departureDate || new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
          )}

          {/* Passengers */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Passengers</label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-400">👥</span>
              <select
                value={searchParams.adults}
                onChange={(e) => setSearchParams(prev => ({ ...prev, adults: parseInt(e.target.value) }))}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {[1,2,3,4,5,6].map(num => (
                  <option key={num} value={num}>{num} Adult{num > 1 ? 's' : ''}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Search Button */}
        <button
          onClick={handleSearch}
          disabled={!searchParams.origin || !searchParams.destination || !searchParams.departureDate || isSearching}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 flex items-center justify-center space-x-2"
        >
          {isSearching ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Searching flights...</span>
            </>
          ) : (
            <>
              <span>🔍</span>
              <span>Search Flights</span>
            </>
          )}
        </button>
      </div>

      {/* Results */}
      {searchResults && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-6">
              Available Flights ({searchResults.flights?.length || 0} found)
            </h3>
            
            <div className="space-y-4">
              {searchResults.flights?.map((flight) => (
                <div key={flight.id} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                  {flight.itineraries.map((itinerary, itinIndex) => (
                    <div key={itinIndex} className="mb-4 last:mb-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-6">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-gray-800">
                              {formatTime(itinerary.segments[0].departure.at)}
                            </div>
                            <div className="text-sm text-gray-500">
                              {itinerary.segments[0].departure.iataCode}
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-center">
                            <div className="text-sm text-gray-500">
                              {formatDuration(itinerary.duration)}
                            </div>
                            <div className="flex items-center space-x-2 my-1">
                              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                              <div className="flex-1 h-px bg-gray-300"></div>
                              <span className="text-gray-400">✈️</span>
                              <div className="flex-1 h-px bg-gray-300"></div>
                              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                            </div>
                            <div className="text-sm text-gray-500">
                              {itinerary.segments.reduce((total, seg) => total + (seg.numberOfStops || 0), 0) === 0 
                                ? 'Direct' 
                                : `${itinerary.segments.length - 1} stop${itinerary.segments.length > 2 ? 's' : ''}`
                              }
                            </div>
                          </div>
                          
                          <div className="text-center">
                            <div className="text-2xl font-bold text-gray-800">
                              {formatTime(itinerary.segments[itinerary.segments.length - 1].arrival.at)}
                            </div>
                            <div className="text-sm text-gray-500">
                              {itinerary.segments[itinerary.segments.length - 1].arrival.iataCode}
                            </div>
                          </div>
                        </div>
                        
                        {itinIndex === 0 && (
                          <div className="text-right">
                            <div className="text-3xl font-bold text-blue-600">
                              {flight.price.currency} {flight.price.total}
                            </div>
                            <div className="text-sm text-gray-400">
                              {itinerary.segments[0].carrierCode} {itinerary.segments[0].number}
                            </div>
                            <button className="mt-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition duration-200">
                              Select Flight
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            
            {(!searchResults.flights || searchResults.flights.length === 0) && (
              <div className="text-center py-8">
                <p className="text-gray-500">No flights found for your search criteria.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FlightSearch;
