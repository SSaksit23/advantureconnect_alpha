// ==========================================
// FILE 2: frontend/src/components/HotelSearch.js
// REPLACE THE ENTIRE FILE WITH THIS CONTENT
// ==========================================\n
import React, { useState, useEffect } from 'react';
import apiClient from '../../services/apiClient'; // Import the global apiClient

const HotelSearch = ({ flightData }) => {
  const [searchParams, setSearchParams] = useState({
    cityCode: '',
    cityName: '',
    checkInDate: '',
    checkOutDate: '',
    adults: 1
  });

  const [citySuggestions, setCitySuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [selectedHotel, setSelectedHotel] = useState(null);

  // Auto-populate from flight data
  useEffect(() => {
    if (flightData) {
      setSearchParams(prev => ({
        ...prev,
        cityCode: flightData.destination,
        cityName: flightData.destinationName,
        checkInDate: flightData.dates.departure,
        checkOutDate: flightData.dates.return || ''
      }));
    }
  }, [flightData]);

  const searchCities = async (query, setSuggestions) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    
    try {
      const response = await apiClient.get(`/locations/search?keyword=${encodeURIComponent(query)}`);
      const cities = response.data.filter(location => 
        location.type === 'CITY' || 
        (location.type === 'AIRPORT' && location.city)
      );
      setSuggestions(cities || []);
    } catch (error) {
      console.error('Error searching cities:', error);
      setSuggestions([]);
    }
  };

  const handleCitySearch = (e) => {
    const value = e.target.value;
    setSearchParams(prev => ({ ...prev, cityName: value }));
    searchCities(value, setCitySuggestions);
    setShowCityDropdown(true);
  };

  const selectCity = (location) => {
    setSearchParams(prev => ({ 
      ...prev, 
      cityCode: location.code,
      cityName: `${location.city || location.name} (${location.code})`
    }));
    setCitySuggestions([]);
    setShowCityDropdown(false);
  };

  const extractCityCode = (cityString) => {
    const match = cityString.match(/\(([A-Z]{3})\)/);
    return match ? match[1] : cityString;
  };

  const handleSearch = async () => {
    const cityCode = extractCityCode(searchParams.cityName) || searchParams.cityCode;
    
    if (!cityCode || !searchParams.checkInDate || !searchParams.checkOutDate) {
      alert('Please fill in all required fields');
      return;
    }

    if (new Date(searchParams.checkOutDate) <= new Date(searchParams.checkInDate)) {
      alert('Check-out date must be after check-in date');
      return;
    }

    setIsSearching(true);
    
    try {
      const queryParams = new URLSearchParams({
        cityCode,
        checkInDate: searchParams.checkInDate,
        checkOutDate: searchParams.checkOutDate,
        adults: searchParams.adults.toString()
      });

      const response = await apiClient.get(`/hotels/search?${queryParams}`);
      setSearchResults(response.data);
    } catch (error) {
      console.error('Error searching hotels:', error);
      alert('Failed to search hotels. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const renderStars = (rating) => {
    if (!rating) return null;
    return (
      <div className="flex items-center">
        {[...Array(5)].map((_, i) => (
          <span key={i} className={`text-sm ${i < rating ? 'text-yellow-400' : 'text-gray-300'}`}>
            ⭐
          </span>
        ))}
        <span className="ml-1 text-sm text-gray-600">({rating})</span>
      </div>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const calculateNights = () => {
    if (!searchParams.checkInDate || !searchParams.checkOutDate) return 0;
    const checkIn = new Date(searchParams.checkInDate);
    const checkOut = new Date(searchParams.checkOutDate);
    const diffTime = Math.abs(checkOut - checkIn);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="space-y-6">
      {/* Flight Connection Info */}
      {flightData && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <span className="text-blue-600">✈️</span>
            <span className="text-blue-800 font-medium">
              Connected from flight search: {flightData.destinationName}
            </span>
          </div>
        </div>
      )}

      {/* Search Form */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Hotel Search</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Destination */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">Destination</label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-400">📍</span>
              <input
                type="text"
                value={searchParams.cityName}
                onChange={handleCitySearch}
                placeholder="City or destination"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {showCityDropdown && citySuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {citySuggestions.map((location, index) => (
                    <button
                      key={index}
                      onClick={() => selectCity(location)}
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

          {/* Check-in Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Check-in</label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-400">📅</span>
              <input
                type="date"
                value={searchParams.checkInDate}
                onChange={(e) => setSearchParams(prev => ({ ...prev, checkInDate: e.target.value }))}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          {/* Check-out Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Check-out</label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-400">📅</span>
              <input
                type="date"
                value={searchParams.checkOutDate}
                onChange={(e) => setSearchParams(prev => ({ ...prev, checkOutDate: e.target.value }))}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min={searchParams.checkInDate || new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          {/* Guests */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Guests</label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-400">👥</span>
              <select
                value={searchParams.adults}
                onChange={(e) => setSearchParams(prev => ({ ...prev, adults: parseInt(e.target.value) }))}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {[1,2,3,4,5,6].map(num => (
                  <option key={num} value={num}>{num} Guest{num > 1 ? 's' : ''}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Stay Duration Info */}
        {searchParams.checkInDate && searchParams.checkOutDate && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">
              {formatDate(searchParams.checkInDate)} → {formatDate(searchParams.checkOutDate)} 
              <span className="font-medium ml-2">({calculateNights()} night{calculateNights() !== 1 ? 's' : ''})</span>
            </div>
          </div>
        )}

        {/* Search Button */}
        <button
          onClick={handleSearch}
          disabled={!searchParams.cityName || !searchParams.checkInDate || !searchParams.checkOutDate || isSearching}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 flex items-center justify-center space-x-2"
        >
          {isSearching ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Searching hotels...</span>
            </>
          ) : (
            <>
              <span>🔍</span>
              <span>Search Hotels</span>
            </>
          )}
        </button>
      </div>

      {/* Results */}
      {searchResults && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-6">
            Available Hotels ({searchResults.hotels?.length || 0} found)
          </h3>
          
          <div className="space-y-6">
            {searchResults.hotels?.map((hotel) => (
              <div 
                key={hotel.hotelId} 
                className={`border rounded-lg p-6 hover:shadow-md transition-shadow cursor-pointer ${
                  selectedHotel?.hotelId === hotel.hotelId ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}
                onClick={() => setSelectedHotel(hotel)}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h4 className="text-lg font-semibold text-gray-800 mb-2">{hotel.name}</h4>
                    {renderStars(hotel.rating)}
                    {hotel.address && (
                      <p className="text-sm text-gray-600 mt-1">
                        {hotel.address.lines?.join(', ')} {hotel.address.cityName}
                      </p>
                    )}
                  </div>
                  {hotel.offers && hotel.offers.length > 0 && (
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">
                        {hotel.offers[0].price.currency} {hotel.offers[0].price.total}
                      </div>
                      <div className="text-sm text-gray-500">per night</div>
                      <div className="text-xs text-gray-400">
                        Total: {hotel.offers[0].price.currency} {(parseFloat(hotel.offers[0].price.total) * calculateNights()).toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Room Options */}
                {hotel.offers && (
                  <div className="border-t pt-4">
                    <h5 className="font-medium text-gray-700 mb-2">Available Rooms:</h5>
                    <div className="space-y-2">
                      {hotel.offers.slice(0, 2).map((offer, index) => (
                        <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                          <div>
                            <div className="font-medium text-sm">
                              {offer.room?.description?.text || 'Standard Room'}
                            </div>
                            <div className="text-xs text-gray-600">
                              {offer.boardType || 'Room Only'}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-blue-600">
                              {offer.price.currency} {offer.price.total}
                            </div>
                            <div className="text-xs text-gray-500">/night</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {(!searchResults.hotels || searchResults.hotels.length === 0) && (
            <div className="text-center py-8">
              <p className="text-gray-500">No hotels found for your search criteria.</p>
              <p className="text-sm text-gray-400 mt-2">Try adjusting your dates or destination.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HotelSearch;
