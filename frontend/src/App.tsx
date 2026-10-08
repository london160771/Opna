import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { AuthForm } from './components/AuthForm';
import { OwnerGuard } from './components/OwnerGuard';
import { OwnerWorkspace } from './components/OwnerWorkspace';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OwnerPage } from './pages/OwnerPage';
import { SetupPage } from './pages/SetupPage';
import { ServicesPage } from './pages/ServicesPage';
import { AvailabilityPage } from './pages/AvailabilityPage';
import { SettingsPage } from './pages/SettingsPage';
import { PublicBookingPage } from './pages/PublicBookingPage';
import { BookingsPage } from './pages/BookingsPage';
import { BookingDetailsPage } from './pages/BookingDetailsPage';

function OwnerLayout() {
  return <OwnerGuard><OwnerWorkspace><Outlet /></OwnerWorkspace></OwnerGuard>;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/book/:slug" element={<PublicBookingPage />} />
          <Route path="/register" element={<AuthForm mode="register" />} />
          <Route path="/login" element={<AuthForm mode="login" />} />
          <Route path="/app/setup" element={<OwnerGuard setupPage><SetupPage /></OwnerGuard>} />
          <Route element={<OwnerLayout />}>
            <Route path="/app" element={<OwnerPage />} />
            <Route path="/app/bookings" element={<BookingsPage />} />
            <Route path="/app/bookings/:id" element={<BookingDetailsPage />} />
            <Route path="/app/services" element={<ServicesPage />} />
            <Route path="/app/availability" element={<AvailabilityPage />} />
            <Route path="/app/settings" element={<SettingsPage />} />
          </Route>
          <Route path="/app/*" element={<Navigate to="/app" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
