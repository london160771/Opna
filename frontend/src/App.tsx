import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { AuthForm } from './components/AuthForm';
import { OwnerGuard } from './components/OwnerGuard';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OwnerPage } from './pages/OwnerPage';
import { SetupPage } from './pages/SetupPage';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/register" element={<AuthForm mode="register" />} />
          <Route path="/login" element={<AuthForm mode="login" />} />
          <Route path="/app/setup" element={<OwnerGuard setupPage><SetupPage /></OwnerGuard>} />
          <Route path="/app" element={<OwnerGuard><OwnerPage /></OwnerGuard>} />
          <Route path="/app/*" element={<Navigate to="/app" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
