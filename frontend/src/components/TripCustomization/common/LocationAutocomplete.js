import React, { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * A location autocomplete input field that fetches suggestions from an API
 * and provides a dropdown for selection. It includes a fallback to static data.
 *
 * @param {object} props - The component's props.
 * @param {string} props.label - The label for the input field.
 * @param {string} props.value - The current value of the input field.
 * @param {function} props.onChange - Function to call when the input value changes.
 *                                    It receives the new string value as an argument.
 * @param {string} [props.placeholder] - The placeholder text for the input field.
 * @param {boolean} [props.required=false] - Whether the input field is required (displays a red asterisk).
 * @returns {JSX.Element} The LocationAutocomplete component.
 */
const LocationAutocomplete = ({ label, value, onChange, placeholder, required }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countriesData, setCountriesData] = useState([]);

  // Static fallback data for countries and cities
  const fallbackCountriesData = [
    { country: 'China', cities: ['Beijing', 'Shanghai', 'Guangzhou', 'Shenzhen', 'Chengdu', 'Hangzhou', 'Xi\'an'] },
    { country: 'France', cities: ['Paris', 'Lyon', 'Marseille', 'Nice'] },
    { country: 'United Kingdom', cities: ['London', 'Manchester', 'Edinburgh', 'Liverpool'] },
    { country: 'Japan', cities: ['Tokyo', 'Osaka', 'Kyoto', 'Yokohama'] },
    { country: 'United States', cities: ['New York', 'Los Angeles', 'Chicago', 'Miami', 'San Francisco', 'Las Vegas'] },
    { country: 'Thailand', cities: ['Bangkok', 'Phuket', 'Chiang Mai', 'Pattaya'] },
    { country: 'Singapore', cities: ['Singapore'] },
    { country: 'South Korea', cities: ['Seoul', 'Busan', 'Incheon'] },
    { country: 'Germany', cities: ['Berlin', 'Munich', 'Hamburg', 'Frankfurt'] },
    { country: 'Italy', cities: ['Rome', 'Milan', 'Venice', 'Florence'] },
    { country: 'Spain', cities: ['Madrid', 'Barcelona', 'Seville', 'Valencia'] },
    { country: 'Australia', cities: ['Sydney', 'Melbourne', 'Brisbane', 'Perth'] },
    { country: 'Canada', cities: ['Toronto', 'Vancouver', 'Montreal', 'Calgary'] },
  ];

  // Cache for the Countries Now API data
  useEffect(() => {
    const loadCountriesData = async () => {
      try {
        const response = await fetch('https://countriesnow.space/api/v0.1/countries');
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        const data = await response.json();
        if (data.error === false && data.data) {
          setCountriesData(data.data);
        } else {
          console.warn('Countries Now API returned error or no data, using fallback.');
          setCountriesData(fallbackCountriesData);
        }
      } catch (error) {
        console.error('Failed to load countries data from API, using fallback:', error);
        setCountriesData(fallbackCountriesData);
      }
    };

    loadCountriesData();
  }, []); // Empty dependency array means this runs once on mount

  /**
   * Gets a 2-letter country code from a country name.
   * Provides a mapping for common countries and a fallback.
   * @param {string} countryName - The full name of the country.
   * @returns {string} The 2-letter country code or a generated code.
   */
  const getCountryCodeFromName = (countryName) => {
    const countryCodeMap = {
      'China': 'CN', 'France': 'FR', 'United Kingdom': 'GB', 'Japan': 'JP',
      'United States': 'US', 'Thailand': 'TH', 'Singapore': 'SG', 'South Korea': 'KR',
      'Germany': 'DE', 'Italy': 'IT', 'Spain': 'ES', 'Australia': 'AU',
      'Canada': 'CA', 'Brazil': 'BR', 'India': 'IN', 'Russia': 'RU',
      'Netherlands': 'NL', 'Switzerland': 'CH', 'Austria': 'AT', 'Belgium': 'BE',
      'Sweden': 'SE', 'Norway': 'NO', 'Denmark': 'DK', 'Finland': 'FI',
      'Poland': 'PL', 'Czech Republic': 'CZ', 'Hungary': 'HU', 'Portugal': 'PT',
      'Greece': 'GR', 'Turkey': 'TR', 'Egypt': 'EG', 'South Africa': 'ZA',
      'Mexico': 'MX', 'Argentina': 'AR', 'Chile': 'CL', 'Colombia': 'CO',
      'Peru': 'PE', 'Venezuela': 'VE', 'Indonesia': 'ID', 'Malaysia': 'MY',
      'Philippines': 'PH', 'Vietnam': 'VN', 'New Zealand': 'NZ', 'Israel': 'IL',
      'United Arab Emirates': 'AE', 'Saudi Arabia': 'SA', 'Morocco': 'MA',
      'Kenya': 'KE', 'Nigeria': 'NG', 'Ghana': 'GH', 'Bangladesh': 'BD',
      'Pakistan': 'PK', 'Sri Lanka': 'LK', 'Nepal': 'NP', 'Myanmar': 'MM',
      'Cambodia': 'KH', 'Laos': 'LA', 'Mongolia': 'MN', 'Kazakhstan': 'KZ',
      'Uzbekistan': 'UZ', 'Georgia': 'GE', 'Armenia': 'AM', 'Azerbaijan': 'AZ',
      'Ukraine': 'UA', 'Belarus': 'BY', 'Moldova': 'MD', 'Romania': 'RO',
      'Bulgaria': 'BG', 'Serbia': 'RS', 'Croatia': 'HR', 'Slovenia': 'SI',
      'Slovakia': 'SK', 'Lithuania': 'LT', 'Latvia': 'LV', 'Estonia': 'EE',
      'Ireland': 'IE', 'Iceland': 'IS', 'Luxembourg': 'LU', 'Malta': 'MT',
      'Cyprus': 'CY', 'Monaco': 'MC', 'Andorra': 'AD', 'San Marino': 'SM',
      'Vatican City': 'VA', 'Liechtenstein': 'LI'
    };
    return countryCodeMap[countryName] || countryName.substring(0, 2).toUpperCase();
  };

  const searchLocations = useCallback((query) => {
    if (!query || query.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);

    // Debounce the actual search logic
    const debounceTimeout = setTimeout(() => {
      const filtered = [];
      const queryLower = query.toLowerCase();

      (countriesData.length > 0 ? countriesData : fallbackCountriesData).forEach(countryData => {
        const country = countryData.country;
        const cities = countryData.cities || [];

        if (country.toLowerCase().includes(queryLower)) {
          filtered.push({
            city: country, // For countries, city and country are the same in this context
            country: country,
            countryCode: getCountryCodeFromName(country),
            isCountry: true
          });
        }

        cities.forEach(city => {
          if (city.toLowerCase().includes(queryLower)) {
            filtered.push({
              city: city,
              country: country,
              countryCode: getCountryCodeFromName(country),
              isCountry: false
            });
          }
        });
      });

      const sorted = filtered
        .sort((a, b) => {
          const aStartsWith = a.city.toLowerCase().startsWith(queryLower);
          const bStartsWith = b.city.toLowerCase().startsWith(queryLower);
          if (aStartsWith && !bStartsWith) return -1;
          if (!aStartsWith && bStartsWith) return 1;
          return a.city.localeCompare(b.city);
        })
        .slice(0, 8); // Limit suggestions

      setSuggestions(sorted);
      setShowDropdown(sorted.length > 0);
      setLoading(false);
    }, 300); // 300ms debounce

    return () => clearTimeout(debounceTimeout); // Cleanup timeout on unmount or new search
  }, [countriesData, fallbackCountriesData]); // Include dependencies for useCallback

  /**
   * Handles input change events.
   * Updates the parent component's value and triggers location search.
   * @param {React.ChangeEvent<HTMLInputElement>} e - The input change event.
   */
  const handleInputChange = (e) => {
    const query = e.target.value;
    onChange(query); // Update parent state
    searchLocations(query);
  };

  /**
   * Handles selection of a location from the dropdown.
   * Updates the parent component's value and closes the dropdown.
   * @param {object} location - The selected location object.
   * @param {string} location.city - The city name.
   * @param {string} location.country - The country name.
   */
  const selectLocation = (location) => {
    const formattedLocation = `${location.city}, ${location.country}`;
    onChange(formattedLocation); // Update parent state
    setSuggestions([]);
    setShowDropdown(false);
  };

  /**
   * Handles the blur event of the input field.
   * Hides the dropdown after a short delay to allow click events on suggestions.
   */
  const handleBlur = () => {
    setTimeout(() => setShowDropdown(false), 200);
  };

  /**
   * Handles the focus event of the input field.
   * Shows suggestions if there's already a value.
   */
  const handleFocus = () => {
    if (value && value.length >= 2) {
      searchLocations(value);
    }
  };

  return (
    <div className="relative">
      <label htmlFor={label.toLowerCase().replace(/\s+/g, '-')} className="block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        <input
          id={label.toLowerCase().replace(/\s+/g, '-')}
          type="text"
          value={value || ''}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          placeholder={placeholder}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          autoComplete="off" // Prevent browser's native autocomplete
        />
        {loading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 mt-0.5">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          </div>
        )}

        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {suggestions.map((location, index) => (
              <button
                key={`${location.city}-${location.country}-${index}`} // More unique key
                type="button"
                onClick={() => selectLocation(location)}
                className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 focus:outline-none focus:bg-blue-50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{location.city}</div>
                    <div className="text-sm text-gray-500">{location.country}</div>
                  </div>
                  <div className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                    {location.countryCode}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-1">
        💡 Start typing a city or country name for suggestions.
      </p>
    </div>
  );
};

export default LocationAutocomplete;
