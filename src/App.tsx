import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';

import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Profile } from './pages/Profile';
import { MyAssistant } from './pages/MyAssistant';
import { AiAssistant } from './pages/AiAssistant';
import { Market } from './pages/Market';
import { Community } from './pages/Community';
import { Daktari } from './pages/Daktari';
import { Admin } from './pages/Admin';
import { Settings } from './pages/Settings';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Main App Layout */}
          <Route element={<Layout />}>
            {/* Home/Dashboard (Protected: requires authentication) */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Home />
                </ProtectedRoute>
              }
            />

            {/* My Assistant / Msaidizi Wangu - Livestock Records (Protected) */}
            <Route
              path="/my-assistant"
              element={
                <ProtectedRoute>
                  <MyAssistant />
                </ProtectedRoute>
              }
            />
            <Route
              path="/msaidizi-wangu"
              element={
                <ProtectedRoute>
                  <MyAssistant />
                </ProtectedRoute>
              }
            />

            {/* Profile (Protected) */}
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />

            {/* Settings / Mipangilio (Protected) */}
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mipangilio"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />

            {/* AI Assistant / Msaidizi wa Kilimo (Protected) */}
            <Route
              path="/ai-assistant"
              element={
                <ProtectedRoute>
                  <AiAssistant />
                </ProtectedRoute>
              }
            />

            {/* Knowledge / Elimu & Miongozo (Protected) */}
            <Route
              path="/knowledge"
              element={
                <ProtectedRoute>
                  <AiAssistant />
                </ProtectedRoute>
              }
            />
            <Route
              path="/elimu"
              element={
                <ProtectedRoute>
                  <AiAssistant />
                </ProtectedRoute>
              }
            />

            {/* Daktari / Ushauri wa Daktari (Protected) */}
            <Route
              path="/daktari"
              element={
                <ProtectedRoute>
                  <Daktari />
                </ProtectedRoute>
              }
            />
            <Route
              path="/daktari-mtaani-kwako"
              element={
                <ProtectedRoute>
                  <Daktari />
                </ProtectedRoute>
              }
            />
            <Route
              path="/madaktari"
              element={
                <ProtectedRoute>
                  <Daktari />
                </ProtectedRoute>
              }
            />

            {/* Market / Gulio */}
            <Route
              path="/market"
              element={
                <ProtectedRoute>
                  <Market />
                </ProtectedRoute>
              }
            />
            <Route
              path="/marketplace"
              element={
                <ProtectedRoute>
                  <Market />
                </ProtectedRoute>
              }
            />
            <Route
              path="/gulio"
              element={
                <ProtectedRoute>
                  <Market />
                </ProtectedRoute>
              }
            />

            {/* Community / Gumzo */}
            <Route
              path="/community"
              element={
                <ProtectedRoute>
                  <Community />
                </ProtectedRoute>
              }
            />
            <Route
              path="/gumzo"
              element={
                <ProtectedRoute>
                  <Community />
                </ProtectedRoute>
              }
            />

            {/* Admin Area (Protected & Admin Only) */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/readiness"
              element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              }
            />
            <Route
              path="/readiness"
              element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              }
            />
            <Route
              path="/admin-readiness"
              element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              }
            />

            {/* Public Authentication Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            {/* Fallback redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
