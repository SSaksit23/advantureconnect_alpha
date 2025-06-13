import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Import Zustand Stores (specifically for initialization or direct access if needed outside components)
// For verifyAuth on app mount, this is now handled within AuthProvider
// import { useAuthStore } from './stores/authStore';

// Contexts
import { AuthProvider } from './contexts/AuthContext'; // Use the refactored AuthProvider
// import { GoogleMapsProvider } from './contexts/GoogleMapsContext'; // Assuming this is still needed

// Components and Pages
import Navbar from './components/Navbar'; // Assuming a Navbar component
import Footer from './components/Footer'; // Assuming a Footer component
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import TripCustomizationPage from './pages/TripCustomizationPage';
import MyBookingsPage from './pages/MyBookingsPage';
import UserProfilePage from './pages/UserProfilePage';
import SettingsPage from './pages/SettingsPage';
import NotFoundPage from './pages/NotFoundPage'; // A 404 page
import ProtectedRoute from './components/ProtectedRoute'; // For routes requiring authentication
import GlobalErrorBoundary from './components/GlobalErrorBoundary'; // Global error boundary

// Styles
import './App.css'; // Main application styles
// import './index.css'; // Tailwind base styles (if index.css imports Tailwind)

function App() {
  // Initialization of authStore (verifyAuth) is now handled within AuthProvider's useEffect.
  // No need to call useAuthStore.getState().verifyAuth() here if AuthProvider does it.

  // Remove any direct Axios interceptor setup from here.
  // Global Axios interceptors for token refresh and CSRF should be configured
  // in a dedicated apiClient.js that uses useAuthStore.getState() as per the
  // documentation in frontend/src/stores/authStore.js and frontend/src/stores/README.md.

  return (
    <GlobalErrorBoundary>
      <Router>
        <AuthProvider>
          {/* <GoogleMapsProvider> */}
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                
                {/* Protected Routes */}
                <Route 
                  path="/customize-trip" 
                  element={
                    <ProtectedRoute>
                      <TripCustomizationPage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/customize-trip/:tripId" 
                  element={
                    <ProtectedRoute>
                      <TripCustomizationPage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/my-bookings" 
                  element={
                    <ProtectedRoute>
                      <MyBookingsPage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/profile" 
                  element={
                    <ProtectedRoute>
                      <UserProfilePage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/settings" 
                  element={
                    <ProtectedRoute>
                      <SettingsPage />
                    </ProtectedRoute>
                  } 
                />

                {/* Fallback for unmatched routes */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </main>
            <Footer />
          </div>
          <ToastContainer
            position="bottom-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="colored"
          />
          {/* </GoogleMapsProvider> */}
        </AuthProvider>
      </Router>
    </GlobalErrorBoundary>
  );
}

export default App;
