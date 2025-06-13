import React from 'react';
import {
  Lightbulb,
  CalendarDays,
  MapIcon, // Using MapIcon to avoid conflict with JavaScript's built-in Map
  Plane,
  Bed,
  MapPin,
  Sparkles,
  Calculator,
  CreditCard,
  Users, // For travelers
  DollarSign, // For budget/currency
  Palette, // For preferences/style
  Route, // For route planning
  ShieldCheck, // For booking/confirmation
} from 'lucide-react';

/**
 * API_URL
 * Base URL for all backend API calls.
 * It attempts to read from the `REACT_APP_API_URL` environment variable,
 * falling back to a default for local development.
 */
export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

/**
 * STEPS
 * Defines the sequence and properties of each step in the trip customization flow.
 * Each step object includes:
 *  - id: A unique numerical identifier for the step.
 *  - name: The display name of the step.
 *  - icon: A React component (from lucide-react) to be used as the visual icon for the step.
 */
export const STEPS = [
  { id: 1, name: 'Inspiration', icon: <Lightbulb className="h-5 w-5" />, description: "Define your trip's theme and initial ideas." },
  { id: 2, name: 'Core Details', icon: <CalendarDays className="h-5 w-5" />, description: "Set destinations, dates, travelers, and budget." },
  { id: 3, name: 'Route Planning', icon: <Route className="h-5 w-5" />, description: "Organize your daily route and waypoints." },
  { id: 4, name: 'Flights', icon: <Plane className="h-5 w-5" />, description: "Search and select flight options." },
  { id: 5, name: 'Accommodation', icon: <Bed className="h-5 w-5" />, description: "Find and book places to stay." },
  { id: 6, name: 'Activities & POIs', icon: <MapPin className="h-5 w-5" />, description: "Discover and add tours, attractions, and points of interest." },
  { id: 7, name: 'Preferences & Style', icon: <Palette className="h-5 w-5" />, description: "Fine-tune travel style, pace, and interests." },
  { id: 8, name: 'Review & Optimize', icon: <Sparkles className="h-5 w-5" />, description: "Review your itinerary and get AI-powered optimization tips." },
  { id: 9, name: 'Finalize & Book', icon: <ShieldCheck className="h-5 w-5" />, description: "Confirm all details and proceed to booking (conceptual)." },
];


// --- Default Values & Configuration Settings ---

/**
 * DEFAULT_CURRENCY
 * Default currency to be used if not specified by the user or trip data.
 */
export const DEFAULT_CURRENCY = 'USD';

/**
 * DEFAULT_TRAVELERS
 * Default number of travelers for a new trip.
 */
export const DEFAULT_TRAVELERS = 1;

/**
 * MAX_DESTINATIONS
 * Maximum number of primary destinations a user can add in the core details.
 * (This is an example, adjust as per application logic)
 */
export const MAX_DESTINATIONS_CORE = 5; // e.g., for the main destinations input field

/**
 * MAX_ITINERARY_STOPS
 * Maximum number of stops/days in the detailed route planning.
 */
export const MAX_ITINERARY_STOPS = 30;


// --- UI Related Constants ---

/**
 * LOCATION_SUGGESTION_LIMIT
 * Number of suggestions to show in location autocomplete dropdowns.
 */
export const LOCATION_SUGGESTION_LIMIT = 8;

/**
 * DEBOUNCE_DELAY_MS
 * Standard debounce delay in milliseconds for input fields that trigger API calls (e.g., autocomplete).
 */
export const DEBOUNCE_DELAY_MS = 300;


// --- Inspiration Types ---
export const INSPIRATION_TYPES = {
  MANUAL: 'manual',
  EXAMPLE_TRIP: 'example_trip',
  AI_IMAGE: 'ai_image',
};

// --- Component Types (for tripData.components array) ---
export const TRIP_COMPONENT_TYPES = {
  FLIGHT: 'flight',
  HOTEL: 'hotel',
  ACTIVITY: 'activity',
  POI: 'poi', // Point of Interest
  TRANSPORTATION: 'transportation', // e.g., train, car rental, ferry
  GUIDE: 'guide', // Local guide service
  CUSTOM: 'custom', // User-added custom event or note
};

// --- Travel Styles & Paces (for preferences) ---
export const TRAVEL_STYLES = [
  { value: 'balanced', label: 'Balanced (Mix of everything)' },
  { value: 'budget', label: 'Budget-Friendly' },
  { value: 'luxury', label: 'Luxury & Comfort' },
  { value: 'adventure', label: 'Adventure & Outdoors' },
  { value: 'relaxing', label: 'Relaxing & Wellness' },
  { value: 'family', label: 'Family-Oriented' },
  { value: 'solo', label: 'Solo Traveler Focused' },
  { value: 'cultural', label: 'Cultural Immersion' },
  { value: 'foodie', label: 'Culinary Exploration' },
];

export const TRAVEL_PACES = [
  { value: 'fast', label: 'Fast-Paced (See as much as possible)' },
  { value: 'medium', label: 'Medium Pace (Good balance)' },
  { value: 'slow', label: 'Slow & Relaxed (In-depth exploration)' },
];

// Add other constants as they become necessary during the refactoring of TripCustomizationEngine
// and its sub-components. This file serves as a central place for such values.
