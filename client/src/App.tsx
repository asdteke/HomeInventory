import { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { VaultProvider } from './context/VaultContext';

import Dashboard from './components/Dashboard';
import Layout from './components/Layout';
import CookieBanner from './components/CookieBanner';
import BrowserBranding from './components/BrowserBranding';
import AppErrorBoundary from './components/AppErrorBoundary';
import { BRAND_NAME } from './constants/branding';

import LandingPage from './components/LandingPage';
import Login from './components/Login';
import Register from './components/Register';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import ItemList from './components/ItemList';
import GoogleHouseSelect from './components/GoogleHouseSelect';
import HouseAccessPending from './components/HouseAccessPending';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsOfService from './components/TermsOfService';
import ItemForm from './components/ItemForm';
import CategoryManager from './components/CategoryManager';
import RoomManager from './components/RoomManager';
import Settings from './components/Settings';
import AdminPanel from './components/AdminPanel';
import RecoveryKeySetup from './components/RecoveryKeySetup';
import PersonalVault from './components/PersonalVault';
import BorrowRequestsPage from './components/BorrowRequestsPage';
import LegalConsent from './components/LegalConsent';
import MaintenancePage from './components/MaintenancePage';
import ShoppingListPage from './components/ShoppingListPage';


const FullscreenSpinner = () => (
    <div className="flex min-h-screen items-center justify-center bg-[var(--hi-bg)] px-4 text-[var(--hi-text)]">
        <div role="status" aria-live="polite" className="w-full max-w-sm rounded-[1.35rem] border border-[var(--hi-border)] bg-[var(--hi-panel)] p-6 text-center shadow-[var(--hi-shadow-soft)]">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]">
                <Loader2 className="h-5 w-5 animate-spin" />
            </span>
            <p className="mt-4 text-sm font-semibold text-[var(--hi-text)]">Loading {BRAND_NAME}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--hi-text-soft)]">Preparing your workspace...</p>
        </div>
    </div>
);

const HouseAccessRoute = () => {
    const { user, loading, membershipState, mustSetupRecoveryKey, mustAcceptLegal } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (!user) return <Navigate to="/" replace />;
    if (mustAcceptLegal) return <Navigate to="/legal-consent" replace />;
    if (mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
    if (membershipState === 'active') return <Navigate to="/" replace />;
    return <HouseAccessPending />;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
    const { user, loading, isAdmin, mustSetupRecoveryKey, mustAcceptLegal } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (!user) return <Navigate to="/" replace />;
    if (mustAcceptLegal) return <Navigate to="/legal-consent" replace />;
    if (mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
    if (!isAdmin) return <Navigate to="/" replace />;
    return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
    const { user, loading, mustSetupRecoveryKey, mustAcceptLegal } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (user && mustAcceptLegal) return <Navigate to="/legal-consent" replace />;
    if (user && mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
    if (user) return <Navigate to="/" replace />;
    return <>{children}</>;
};

const LandingRoute = () => {
    const { user, loading, mustSetupRecoveryKey, mustAcceptLegal } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (user && mustAcceptLegal) return <Navigate to="/legal-consent" replace />;
    if (user && mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
    if (user) return <Navigate to="/" replace />;
    return <LandingPage />;
};

const HomeIndexRoute = () => {
    const { user, loading, membershipState, mustSetupRecoveryKey, mustAcceptLegal } = useAuth();

    if (loading) return <FullscreenSpinner />;
    if (!user) {
        return <LandingPage />;
    }
    if (mustAcceptLegal) return <Navigate to="/legal-consent" replace />;
    if (mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
    if (membershipState !== 'active') return <Navigate to="/house-access" replace />;

    return <Dashboard />;
};

const RootRoute = () => {
    const { user, loading, membershipState, mustSetupRecoveryKey, mustAcceptLegal } = useAuth();
    const location = useLocation();

    if (loading) return <FullscreenSpinner />;

    if (!user) {
        if (location.pathname === '/') {
            return <Outlet />;
        }
        return <Navigate to="/landing" replace />;
    }

    if (mustAcceptLegal) return <Navigate to="/legal-consent" replace />;
    if (mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
    if (membershipState !== 'active') return <Navigate to="/house-access" replace />;

    return <Layout />;
};

const RecoveryKeySetupRoute = () => {
    const { user, loading, mustSetupRecoveryKey, passwordRecoveryMode, membershipState, mustAcceptLegal } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (!user) return <Navigate to="/login" replace />;
    if (mustAcceptLegal) return <Navigate to="/legal-consent" replace />;
    if (passwordRecoveryMode !== 'recovery_key' || !mustSetupRecoveryKey) {
        return <Navigate to={membershipState === 'active' ? '/' : '/house-access'} replace />;
    }
    return <RecoveryKeySetup />;
};

const GoogleHouseSelectRoute = () => {
    const { user, loading, mustAcceptLegal } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (!user) return <Navigate to="/login" replace />;
    if (mustAcceptLegal) return <Navigate to="/legal-consent" replace />;
    return <GoogleHouseSelect />;
};

const LegalConsentRoute = () => {
    const { user, loading, mustAcceptLegal, mustSetupRecoveryKey, membershipState } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (!user) return <Navigate to="/login" replace />;
    if (!mustAcceptLegal) {
        if (mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
        if (membershipState === 'active') return <Navigate to="/" replace />;
        if (membershipState === 'pending_approval') return <Navigate to="/house-access" replace />;
        return <Navigate to="/google-house-select" replace />;
    }
    return <LegalConsent />;
};

function AppRoutes() {
    return (
        <Routes>
            <Route path="/landing" element={<LandingRoute />} />
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
            <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
            <Route path="/google-house-select" element={<GoogleHouseSelectRoute />} />
            <Route path="/recovery-key-setup" element={<RecoveryKeySetupRoute />} />
            <Route path="/house-access" element={<HouseAccessRoute />} />
            <Route path="/legal-consent" element={<LegalConsentRoute />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            <Route path="/" element={<RootRoute />}>
                <Route index element={<HomeIndexRoute />} />
                <Route path="items" element={<ItemList />} />
                <Route path="maintenance" element={<MaintenancePage />} />
                <Route path="shopping" element={<ShoppingListPage />} />
                <Route path="borrow-requests" element={<BorrowRequestsPage />} />
                <Route path="vault" element={<PersonalVault />} />
                <Route path="items/new" element={<ItemForm />} />
                <Route path="items/:id/edit" element={<ItemForm />} />
                <Route path="categories" element={<CategoryManager />} />
                <Route path="rooms" element={<RoomManager />} />
                <Route path="settings" element={<Settings />} />
                <Route path="admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
                <Route path="admin/mail-gonder" element={<Navigate to="/admin" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <VaultProvider>
                    <Router>
                        <BrowserBranding />
                        <CookieBanner />
                        <AppErrorBoundary>
                            <AppRoutes />
                        </AppErrorBoundary>
                    </Router>
                </VaultProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}

export default App;
