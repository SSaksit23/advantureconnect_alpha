import React, { useState, useEffect, useCallback } from 'react';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { Loader2, CalendarDays, Users, DollarSign, Globe, Info } from 'lucide-react';
import { toast } from 'react-toastify';

import { useCurrentTripData, useTripActions, useTripLoadingStates, useTripError } from '../../../stores/tripStore'; // Adjusted path
import { useAuthUser } from '../../../stores/authStore'; // Adjusted path

import InputField from '../common/InputField';
import LocationAutocomplete from '../common/LocationAutocomplete';
// API_URL from constants might be needed for direct API calls if not using apiClient for everything
// For visa/currency, if they are public APIs, direct fetch is okay.
// import { API_URL } from '../../../constants/tripCustomization';

// --- Helper Data & Functions (can be moved to utils if shared) ---

const countries = [ // For nationality dropdown - ensure codes match VisaDB if used
  { code: 'TH', name: 'Thailand' }, { code: 'US', name: 'United States' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' }, { code: 'FR', name: 'France' }, { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' }, { code: 'NL', name: 'Netherlands' }, { code: 'BE', name: 'Belgium' },
  { code: 'AT', name: 'Austria' }, { code: 'CH', name: 'Switzerland' }, { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' }, { code: 'DK', name: 'Denmark' }, { code: 'FI', name: 'Finland' },
  { code: 'IE', name: 'Ireland' }, { code: 'PT', name: 'Portugal' }, { code: 'GR', name: 'Greece' },
  { code: 'CA', name: 'Canada' }, { code: 'AU', name: 'Australia' }, { code: 'NZ', name: 'New Zealand' },
  { code: 'JP', name: 'Japan' }, { code: 'KR', name: 'South Korea' }, { code: 'SG', name: 'Singapore' },
  { code: 'MY', name: 'Malaysia' }, { code: 'PH', name: 'Philippines' }, { code: 'ID', name: 'Indonesia' },
  { code: 'VN', name: 'Vietnam' }, { code: 'IN', name: 'India' }, { code: 'CN', name: 'China' },
  { code: 'HK', name: 'Hong Kong' }, { code: 'TW', name: 'Taiwan' }, { code: 'BR', name: 'Brazil' },
  { code: 'AR', name: 'Argentina' }, { code: 'CL', name: 'Chile' }, { code: 'MX', name: 'Mexico' },
  { code: 'ZA', name: 'South Africa' }, { code: 'NG', name: 'Nigeria' }, { code: 'KE', name: 'Kenya' },
  { code: 'EG', name: 'Egypt' }, { code: 'MA', name: 'Morocco' }, { code: 'TR', name: 'Turkey' },
  { code: 'AE', name: 'United Arab Emirates' }, { code: 'SA', name: 'Saudi Arabia' }, { code: 'IL', name: 'Israel' },
  { code: 'RU', name: 'Russia' }, { code: 'UA', name: 'Ukraine' }, { code: 'PL', name: 'Poland' },
  { code: 'CZ', name: 'Czech Republic' }, { code: 'HU', name: 'Hungary' }, { code: 'PE', name: 'Peru' },
  { code: 'CO', name: 'Colombia' }, { code: 'GH', name: 'Ghana' }, { code: 'ET', name: 'Ethiopia' }
].sort((a, b) => a.name.localeCompare(b.name));

const getCountryCurrency = (countryName) => {
    const countryCurrencyMap = {
      'United States': 'USD', 'China': 'CNY', 'Japan': 'JPY', 'Germany': 'EUR', 'United Kingdom': 'GBP',
      'France': 'EUR', 'India': 'INR', 'Italy': 'EUR', 'Brazil': 'BRL', 'Canada': 'CAD', 'Russia': 'RUB',
      'South Korea': 'KRW', 'Australia': 'AUD', 'Spain': 'EUR', 'Mexico': 'MXN', 'Indonesia': 'IDR',
      'Netherlands': 'EUR', 'Saudi Arabia': 'SAR', 'Taiwan': 'TWD', 'Belgium': 'EUR', 'Argentina': 'ARS',
      'Ireland': 'EUR', 'Israel': 'ILS', 'Thailand': 'THB', 'Nigeria': 'NGN', 'Egypt': 'EGP',
      'South Africa': 'ZA', 'Bangladesh': 'BDT', 'Vietnam': 'VND', 'Chile': 'CLP', 'Finland': 'EUR',
      'Romania': 'RON', 'Czech Republic': 'CZK', 'Portugal': 'EUR', 'Peru': 'PEN', 'New Zealand': 'NZD',
      'Greece': 'EUR', 'Iraq': 'IQD', 'Algeria': 'DZD', 'Qatar': 'QAR', 'Kazakhstan': 'KZT',
      'Hungary': 'HUF', 'Kuwait': 'KWD', 'Ukraine': 'UAH', 'Morocco': 'MAD', 'Slovakia': 'EUR',
      'Ecuador': 'USD', 'Puerto Rico': 'USD', 'Angola': 'AOA', 'Kenya': 'KES', 'Sri Lanka': 'LKR',
      'Dominican Republic': 'DOP', 'Ethiopia': 'ETB', 'Guatemala': 'GTQ', 'Oman': 'OMR', 'Bulgaria': 'BGN',
      'Myanmar': 'MMK', 'Panama': 'USD', 'Croatia': 'EUR', 'Belarus': 'BYN', 'Azerbaijan': 'AZN',
      'Serbia': 'RSD', 'Lithuania': 'EUR', 'Tunisia': 'TND', 'Slovenia': 'EUR', 'Libya': 'LYD',
      'Uruguay': 'UYU', 'Costa Rica': 'CRC', 'Lebanon': 'LBP', 'Nepal': 'NPR', 'Paraguay': 'PYG',
      'Uganda': 'UGX', 'Jordan': 'JOD', 'Latvia': 'EUR', 'Bolivia': 'BOB', 'Bahrain': 'BHD',
      'Cambodia': 'KHR', 'Estonia': 'EUR', 'Trinidad and Tobago': 'TTD', 'El Salvador': 'USD',
      'Cyprus': 'EUR', 'Honduras': 'HNL', 'Papua New Guinea': 'PGK', 'Senegal': 'XOF', 'Zimbabwe': 'USD',
      'Bosnia and Herzegovina': 'BAM', 'Botswana': 'BWP', 'Gabon': 'XAF', 'Jamaica': 'JMD', 'Albania': 'ALL',
      'Nicaragua': 'NIO', 'Moldova': 'MDL', 'Madagascar': 'MGA', 'Malta': 'EUR', 'Namibia': 'NAD',
      'Armenia': 'AMD', 'Mongolia': 'MNT', 'Mozambique': 'MZN', 'Benin': 'XOF', 'Burkina Faso': 'XOF',
      'Guinea': 'GNF', 'Iceland': 'ISK', 'Maldives': 'MVR', 'Mali': 'XOF', 'Niger': 'XOF',
      'Chad': 'XAF', 'Somalia': 'SOS', 'Suriname': 'SRD', 'Luxembourg': 'EUR', 'Mauritius': 'MUR',
      'Singapore': 'SGD', 'Malaysia': 'MYR', 'Philippines': 'PHP', 'Hong Kong': 'HKD', 'Pakistan': 'PKR',
      'Turkey': 'TRY', 'Iran': 'IRR', 'United Arab Emirates': 'AE', 'Switzerland': 'CHF', 'Norway': 'NOK',
      'Sweden': 'SEK', 'Denmark': 'DKK', 'Poland': 'PLN', 'Austria': 'EUR', 'Ghana': 'GHS',
      'Tanzania': 'TZS', 'Cameroon': 'XAF', 'Ivory Coast': 'XOF', 'Zambia': 'ZMW', 'Togo': 'XOF',
      'Sierra Leone': 'SLL', 'Liberia': 'LRD', 'Mauritania': 'MRU', 'Gambia': 'GMD',
      'Guinea-Bissau': 'XOF', 'Cape Verde': 'CVE', 'Sao Tome and Principe': 'STD'
    };
    return countryCurrencyMap[countryName] || 'USD';
};

const getStaticExchangeRate = (fromCurrency, toCurrency) => {
    const staticRates = {
      'USD': 1, 'EUR': 0.92, 'GBP': 0.79, 'JPY': 157, 'CNY': 7.25, 'THB': 36.7, 'SGD': 1.35,
      'KRW': 1380, 'AUD': 1.50, 'CAD': 1.37, 'CHF': 0.89, 'HKD': 7.8, 'INR': 83.5, 'MYR': 4.7,
      'PHP': 58.5, 'VND': 25400, 'IDR': 16200, 'BRL': 5.35, 'RUB': 90, 'TRY': 32.5, 'ZAR': 18.5
    };
    const fromRateToUSD = staticRates[fromCurrency] ? 1 / staticRates[fromCurrency] : (fromCurrency === 'USD' ? 1 : null);
    const toRateFromUSD = staticRates[toCurrency] || null;

    if (fromRateToUSD === null || toRateFromUSD === null) {
        console.warn(`Static rate not found for ${fromCurrency} or ${toCurrency}`);
        return { from: fromCurrency, to: toCurrency, rate: 1, date: new Date().toISOString(), formatted: `1 ${fromCurrency} = 1.0000 ${toCurrency}`, isStatic: true, error: true };
    }
    const rate = toRateFromUSD * fromRateToUSD;
    return { from: fromCurrency, to: toCurrency, rate: rate, date: new Date().toISOString(), formatted: `1 ${fromCurrency} = ${rate.toFixed(4)} ${toCurrency}`, isStatic: true };
};

const getCountryCodeForVisaDB = (countryName) => { // For VisaDB API
    const map = {
      'China': 'CN', 'United States': 'US', 'United Kingdom': 'GB', 'France': 'FR', 'Germany': 'DE',
      'Italy': 'IT', 'Spain': 'ES', 'Japan': 'JP', 'South Korea': 'KR', 'Thailand': 'TH',
      'Singapore': 'SG', 'Malaysia': 'MY', 'Indonesia': 'ID', 'Philippines': 'PH', 'Vietnam': 'VN',
      'India': 'IN', 'Australia': 'AU', 'Canada': 'CA', 'Brazil': 'BR', 'Mexico': 'MX', 'Turkey': 'TR',
      'Egypt': 'EG', 'South Africa': 'ZA', 'Netherlands': 'NL', 'Belgium': 'BE', 'Switzerland': 'CH',
      'Austria': 'AT', 'Sweden': 'SE', 'Norway': 'NO', 'Denmark': 'DK', 'Finland': 'FI', 'Greece': 'GR',
      'Portugal': 'PT', 'Czech Republic': 'CZ', 'Hungary': 'HU', 'Poland': 'PL', 'Russia': 'RU',
      'Ukraine': 'UA', 'United Arab Emirates': 'AE', 'Saudi Arabia': 'SA', 'Israel': 'IL', 'Hong Kong': 'HK',
      'Taiwan': 'TW', 'New Zealand': 'NZ', 'Argentina': 'AR', 'Chile': 'CL', 'Peru': 'PE',
      'Colombia': 'CO', 'Morocco': 'MA', 'Kenya': 'KE', 'Nigeria': 'NG', 'Ghana': 'GH', 'Ethiopia': 'ET'
    };
    return map[countryName] || countryName.substring(0, 2).toUpperCase();
};


const Step2CoreDetailsComponent = ({ onNext, onPrev, isLoading: isOrchestratorLoading }) => {
  const tripData = useCurrentTripData();
  const { updateTripDetails } = useTripActions();
  const { isLoading: isTripStoreLoading, error: tripStoreError } = useTripLoadingStates(); // Get loading from tripStore if needed for save/create
  const authUser = useAuthUser();

  // Local UI state for this step
  const [visaRequirements, setVisaRequirements] = useState(null);
  const [loadingVisa, setLoadingVisa] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(null);
  const [loadingExchange, setLoadingExchange] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState(tripData.currency || 'USD');
  const [targetCurrency, setTargetCurrency] = useState('USD');
  const [cityCountryCache, setCityCountryCache] = useState({}); // For mapCityToCountry

  const effectiveLoading = isOrchestratorLoading || isTripStoreLoading;

  const handleDetailChange = (e) => {
    const { name, value } = e.target;
    let processedValue = value;
    if (name === "number_of_travelers" || name === "budget_amount") {
      processedValue = parseFloat(value) || 0;
      if (name === "number_of_travelers" && processedValue < 1) processedValue = 1;
      if (name === "budget_amount" && processedValue < 0) processedValue = 0;
    }
    updateTripDetails({ [name]: processedValue });
  };

  const handleDateChange = (name, date) => {
    updateTripDetails({ [name]: date ? date.toISOString().split('T')[0] : null });
  };

  // --- Currency Exchange Logic ---
  const fetchExchangeRate = useCallback(async (from, to) => {
    if (!from || !to || from === to) {
      setExchangeRate(null);
      return;
    }
    setLoadingExchange(true);
    try {
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`);
      if (!response.ok) throw new Error(`ExchangeRate-API failed: ${response.status}`);
      const data = await response.json();
      if (data.rates && data.rates[to]) {
        const rate = parseFloat(data.rates[to]);
        setExchangeRate({ from, to, rate, date: data.date, formatted: `1 ${from} = ${rate.toFixed(4)} ${to}`, isStatic: false });
      } else {
        throw new Error('Rate not found in response');
      }
    } catch (error) {
      console.warn('Live exchange rate API error, using static fallback:', error.message);
      setExchangeRate(getStaticExchangeRate(from, to));
    } finally {
      setLoadingExchange(false);
    }
  }, []);

  // --- Visa Requirements Logic ---
  const mapCityToCountry = useCallback(async (cityOrCountry) => {
    if (cityCountryCache[cityOrCountry]) return cityCountryCache[cityOrCountry];
    if (cityOrCountry.includes(',')) return cityOrCountry.split(',').pop().trim();
    try {
      const response = await fetch('https://countriesnow.space/api/v0.1/countries');
      if (!response.ok) throw new Error('CountriesNow API failed');
      const data = await response.json();
      if (!data.error && data.data) {
        for (const countryData of data.data) {
          if ((countryData.cities || []).some(city => city.toLowerCase() === cityOrCountry.toLowerCase())) {
            setCityCountryCache(prev => ({ ...prev, [cityOrCountry]: countryData.country }));
            return countryData.country;
          }
        }
      }
    } catch (error) { console.warn('mapCityToCountry API error:', error.message); }
    return cityOrCountry; // Fallback
  }, [cityCountryCache]);

  const fetchVisaRequirements = useCallback(async (nationality, destinationsStr) => {
    if (!nationality || !destinationsStr) {
      setVisaRequirements(null);
      return;
    }
    setLoadingVisa(true);
    setVisaRequirements({}); // Clear previous
    try {
      const destinationList = destinationsStr.split(';;').map(d => d.trim()).filter(Boolean);
      const uniqueCountries = new Set();
      const resolvedCountries = await Promise.all(destinationList.map(dest => mapCityToCountry(dest.split(',')[0].trim())));
      resolvedCountries.forEach(country => { if (country) uniqueCountries.add(country.trim()); });

      const visaInfo = {};
      for (const countryName of uniqueCountries) {
        const destCountryCode = getCountryCodeForVisaDB(countryName);
        let visaStatus = 'Info unavailable';
        try {
          // Using a CORS proxy for VisaDB if direct calls fail due to CORS
          const proxyUrl = 'https://cors-anywhere.herokuapp.com/'; // Example proxy
          const apiUrl = `https://www.visadb.io/api/v1/visa/${nationality}/${destCountryCode}`;
          // const response = await fetch(proxyUrl + apiUrl, { headers: { 'Accept': 'application/json' } });
          // For now, direct fetch, assuming CORS is handled or VisaDB has changed. If it fails, static fallback is used.
          const response = await fetch(apiUrl, { headers: { 'Accept': 'application/json' } });

          if (response.ok) {
            const data = await response.json();
            visaStatus = data.data?.requirement || data.requirement || 'Info unavailable';
            if (data.data?.max_stay || data.max_stay) visaStatus += ` (Max stay: ${data.data?.max_stay || data.max_stay} days)`;
          } else if (response.status === 404) {
            visaStatus = 'Visa information not available for this destination';
          } else {
            throw new Error(`VisaDB API returned: ${response.status}`);
          }
        } catch (apiError) {
          console.warn(`VisaDB API failed for ${countryName}:`, apiError.message, `Falling back to static info.`);
          visaStatus = getStaticVisaInfo(nationality, countryName);
        }
        visaInfo[countryName] = visaStatus;
      }
      setVisaRequirements(visaInfo);
    } catch (error) {
      console.error('Error fetching visa requirements:', error);
      setVisaRequirements({ error: 'Unable to fetch visa information.' });
    } finally {
      setLoadingVisa(false);
    }
  }, [mapCityToCountry]); // Removed cityCountryCache from deps as it's managed internally by mapCityToCountry

  const getStaticVisaInfo = (nationalityCode, destinationCountry) => { // Simplified
    const staticData = { 'TH': { 'Japan': '🟢 Visa Free (Static)' } };
    return staticData[nationalityCode]?.[destinationCountry] || '⚠️ Check embassy (Static)';
  };

  // --- Effects ---
  useEffect(() => { // Visa requirements
    const timeoutId = setTimeout(() => {
      if (tripData.preferences?.nationality && tripData.destinations) {
        fetchVisaRequirements(tripData.preferences.nationality, tripData.destinations);
      } else {
        setVisaRequirements(null);
      }
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [tripData.preferences?.nationality, tripData.destinations, fetchVisaRequirements]);

  useEffect(() => { // Base currency from nationality
    if (tripData.preferences?.nationality) {
      const natCountry = countries.find(c => c.code === tripData.preferences.nationality)?.name;
      if (natCountry) setBaseCurrency(getCountryCurrency(natCountry));
    }
  }, [tripData.preferences?.nationality]);

  useEffect(() => { // Target currency from first destination
    const updateTarget = async () => {
      if (tripData.destinations) {
        const firstDestName = tripData.destinations.split(';;')[0].split(',')[0].trim();
        if (firstDestName) {
          const destCountry = await mapCityToCountry(firstDestName);
          setTargetCurrency(getCountryCurrency(destCountry));
        }
      }
    };
    const timeoutId = setTimeout(updateTarget, 1000);
    return () => clearTimeout(timeoutId);
  }, [tripData.destinations, mapCityToCountry]);

  useEffect(() => { // Exchange rate
    if (baseCurrency && targetCurrency && baseCurrency !== targetCurrency) {
      fetchExchangeRate(baseCurrency, targetCurrency);
    } else {
      setExchangeRate(null); // Clear if same or invalid
    }
  }, [baseCurrency, targetCurrency, fetchExchangeRate]);


  const handleProceed = async () => {
    // Basic validation before proceeding
    if (!tripData.destinations || !tripData.start_date || !tripData.end_date) {
        toast.warn("Please fill in destinations and dates to proceed.");
        return;
    }
    if (new Date(tripData.end_date) < new Date(tripData.start_date)) {
        toast.error("End date cannot be before start date.");
        return;
    }
    // Call the onNext prop passed from the orchestrator, which handles saving and navigation
    onNext();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3 mb-2">
        <CalendarDays className="h-8 w-8 text-blue-600" />
        <h2 className="text-2xl font-semibold text-gray-800">Core Trip Details</h2>
      </div>
      <p className="text-gray-600">
        Lay the groundwork for your adventure by defining the essential details.
      </p>

      <div className="space-y-4">
        <InputField
          label="Trip Title"
          name="title"
          value={tripData.title}
          onChange={handleDetailChange}
          placeholder="e.g., My European Adventure, Summer in Southeast Asia"
          required
          disabled={effectiveLoading}
          error={!tripData.title?.trim() ? "A trip title is needed to save and proceed." : ""}
        />
        <div>
          <label className="block text-sm font-medium text-gray-700">Your Nationality</label>
          <select
            value={tripData.preferences?.nationality || ''}
            onChange={(e) => updateTripDetails({ preferences: { ...tripData.preferences, nationality: e.target.value } })}
            disabled={effectiveLoading}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
          >
            <option value="">Select your nationality</option>
            {countries.map(country => (
              <option key={country.code} value={country.code}>{country.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">This helps us provide visa requirement information.</p>
        </div>

        <LocationAutocomplete
          label="Primary Destination(s)"
          value={tripData.destinations}
          onChange={(value) => updateTripDetails({ destinations: value })}
          placeholder="e.g., Osaka, Japan or Tokyo, Japan;; Kyoto, Japan"
          required
          disabled={effectiveLoading}
        />
        <p className="text-xs text-gray-500 mt-1">💡 For multiple destinations, separate with `;;` (e.g., "Tokyo, Japan;; Kyoto, Japan").</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Start Date</label>
            <DatePicker
              selected={tripData.start_date ? new Date(tripData.start_date + "T00:00:00") : null} // Ensure correct date parsing
              onChange={(date) => handleDateChange('start_date', date)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
              dateFormat="yyyy-MM-dd"
              placeholderText="YYYY-MM-DD"
              disabled={effectiveLoading}
              minDate={new Date()}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">End Date</label>
            <DatePicker
              selected={tripData.end_date ? new Date(tripData.end_date + "T00:00:00") : null} // Ensure correct date parsing
              onChange={(date) => handleDateChange('end_date', date)}
              minDate={tripData.start_date ? new Date(new Date(tripData.start_date).setDate(new Date(tripData.start_date).getDate() + 1)) : new Date(new Date().setDate(new Date().getDate() + 1)) }
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
              dateFormat="yyyy-MM-dd"
              placeholderText="YYYY-MM-DD"
              disabled={effectiveLoading}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputField
            label="Number of Travelers" type="number" name="number_of_travelers"
            value={tripData.number_of_travelers} onChange={handleDetailChange} min="1" disabled={effectiveLoading}
          />
          <div></div> {/* Spacer */}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <InputField
              label="Total Budget (Optional)" type="number" name="budget_amount"
              value={tripData.budget_amount} onChange={handleDetailChange} min="0" placeholder="e.g. 2000" disabled={effectiveLoading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Budget Currency</label>
            <select
              value={tripData.currency || targetCurrency || 'USD'}
              onChange={(e) => updateTripDetails({ currency: e.target.value })}
              disabled={effectiveLoading}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
            >
              {baseCurrency && baseCurrency !== targetCurrency && (<option value={baseCurrency}>{baseCurrency} (Your Approx. Home)</option>)}
              {targetCurrency && (<option value={targetCurrency}>{targetCurrency} (Destination Approx.)</option>)}
              <option value="USD">USD ($)</option> <option value="EUR">EUR (€)</option> <option value="GBP">GBP (£)</option>
              <option value="JPY">JPY (¥)</option> <option value="CNY">CNY (¥)</option> <option value="CAD">CAD ($)</option>
              <option value="AUD">AUD ($)</option> <option value="THB">THB (฿)</option> <option value="SGD">SGD ($)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">💡 Auto-detected from nationality & destination.</p>
          </div>
        </div>

        {/* Exchange Rate Display */}
        {(baseCurrency && targetCurrency && baseCurrency !== targetCurrency) && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg mt-4">
            <h4 className="font-semibold text-green-800 mb-2 flex items-center">
              <DollarSign className="h-5 w-5 mr-2" /> Exchange Rate Information
              {loadingExchange && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
            </h4>
            {loadingExchange ? <p className="text-green-600 text-sm">Getting latest rates...</p>
              : exchangeRate ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-green-700">
                    {exchangeRate.formatted}
                    {exchangeRate.isStatic && (<span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">APPROX.</span>)}
                  </p>
                  <p className="text-xs text-green-600">
                    {exchangeRate.isStatic ? 'Approximate static rates - Live rates temporarily unavailable' : `Updated: ${new Date(exchangeRate.date).toLocaleDateString()}`}
                  </p>
                  {tripData.budget_amount > 0 && exchangeRate.rate && (
                    <p className="text-xs text-green-600 mt-1">
                      Your budget of {tripData.budget_amount.toLocaleString()} {tripData.currency || targetCurrency} is approx. {(tripData.budget_amount / (tripData.currency === exchangeRate.to ? exchangeRate.rate : 1/exchangeRate.rate) ).toLocaleString(undefined, {maximumFractionDigits:0})} {tripData.currency === exchangeRate.to ? exchangeRate.from : exchangeRate.to}.
                    </p>
                  )}
                </div>
              ) : <p className="text-gray-600 text-sm">Exchange rate info unavailable.</p>}
          </div>
        )}

        {/* Visa Requirements Display */}
        {tripData.preferences?.nationality && tripData.destinations && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mt-4">
            <h4 className="font-semibold text-blue-800 mb-2 flex items-center">
              <Globe className="h-5 w-5 mr-2" /> Visa Requirements
              {loadingVisa && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
            </h4>
            {loadingVisa ? <p className="text-blue-600 text-sm">Checking visa requirements...</p>
              : visaRequirements ? (
                visaRequirements.error ? <p className="text-red-600 text-sm">{visaRequirements.error}</p>
                : Object.keys(visaRequirements).length > 0 ? (
                    <div className="space-y-1">
                      {Object.entries(visaRequirements).map(([country, requirement]) => (
                        <p key={country} className="text-sm">
                          <span className="font-medium">{country}:</span>{' '}
                          <span className={
                            requirement.toLowerCase().includes('visa required') || requirement.toLowerCase().includes('no admission') ? 'text-red-600' :
                            requirement.toLowerCase().includes('visa free') ? 'text-green-600' :
                            requirement.toLowerCase().includes('visa on arrival') || requirement.toLowerCase().includes('eta') || requirement.toLowerCase().includes('evisa') ? 'text-yellow-600' :
                            'text-gray-600'
                          }>{requirement}</span>
                        </p>
                      ))}
                      <p className="text-xs text-blue-600 mt-2">💡 Visa requirements may change. Please verify with official sources.</p>
                    </div>
                  ) : <p className="text-sm text-gray-500">No specific visa information found for the combination. Please check official sources.</p>
              ) : <p className="text-sm text-gray-500">Enter nationality and destinations to see visa info.</p>}
          </div>
        )}
      </div>

      <div className="pt-2 text-right">
         <button
          type="button"
          onClick={handleProceed}
          disabled={effectiveLoading || !tripData.destinations || !tripData.start_date || !tripData.end_date}
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center ml-auto"
        >
          {effectiveLoading ? ( <Loader2 className="animate-spin h-5 w-5 mr-2" /> ) : ( <Users className="h-5 w-5 mr-2" /> )}
          {effectiveLoading ? 'Processing...' : 'Next: Route Planning'}
        </button>
      </div>
    </div>
  );
};

export default Step2CoreDetailsComponent;
