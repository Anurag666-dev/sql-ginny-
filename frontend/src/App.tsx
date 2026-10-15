import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Chat } from './pages/Chat';
import { VisualizeDb } from './pages/VisualizeDb';
import { BusinessStructs } from './pages/BusinessStructs';
import { SchemaStudio } from './pages/SchemaStudio';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/visualize-db"
            element={
              <ProtectedRoute>
                <VisualizeDb />
              </ProtectedRoute>
            }
          />
          <Route
            path="/business-structs"
            element={
              <ProtectedRoute>
                <BusinessStructs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/schema-studio"
            element={
              <ProtectedRoute>
                <SchemaStudio />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};
