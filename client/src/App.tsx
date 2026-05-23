import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { VaultProvider } from './context/VaultContext';

import Dashboard from './components/Dashboard';
import Layout from './components/Layout';
import CookieBanner from './components/CookieBanner';
import BrowserBranding from './components/BrowserBranding';
const LandingPage = lazy(() => import('./components/LandingPage'));
const Login = lazy(() => import('./components/Login'));
const Register = lazy(() => import('./components/Register'));
const ForgotPassword = lazy(() => import('./components/ForgotPassword'));
const ResetPassword = lazy(() => import('./components/ResetPassword'));
const ItemList = lazy(() => import('./components/ItemList'));
const GoogleHouseSelect = lazy(() => import('./components/GoogleHouseSelect'));
const HouseAccessPending = lazy(() => import('./components/HouseAccessPending'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./components/TermsOfService'));
const ItemForm = lazy(() => import('./components/ItemForm'));
const CategoryManager = lazy(() => import('./components/CategoryManager'));
const RoomManager = lazy(() => import('./components/RoomManager'));
const Settings = lazy(() => import('./components/Settings'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const RecoveryKeySetup = lazy(() => import('./components/RecoveryKeySetup'));
const PersonalVault = lazy(() => import('./components/PersonalVault'));
const BorrowRequestsPage = lazy(() => import('./components/BorrowRequestsPage'));
const LegalConsent = lazy(() => import('./components/LegalConsent'));
const MaintenancePage = lazy(() => import('./components/MaintenancePage'));
const ShoppingListPage = lazy(() => import('./components/ShoppingListPage'));

const FullscreenSpinner = () => (
    <div className="min-h-screen flex items-center justify-center bg-[var(--hi-bg)]">
        <div className="spinner"></div>
    </div>
);

const LazyRoute = ({ children }: { children: React.ReactNode }) => (
    <Suspense fallback={<FullscreenSpinner />}>
        {children}
    </Suspense>
);

const HouseAccessRoute = () => {
    const { user, loading, membershipState, mustSetupRecoveryKey, mustAcceptLegal } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (!user) return <Navigate to="/" replace />;
    if (mustAcceptLegal) return <Navigate to="/legal-consent" replace />;
    if (mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
    if (membershipState === 'active') return <Navigate to="/" replace />;
    return (
        <LazyRoute>
            <HouseAccessPending />
        </LazyRoute>
    );
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
    return (
        <LazyRoute>
            <LandingPage />
        </LazyRoute>
    );
};

const HomeIndexRoute = () => {
    const { user, loading, membershipState, mustSetupRecoveryKey, mustAcceptLegal } = useAuth();

    if (loading) return <FullscreenSpinner />;
    if (!user) {
        return (
            <LazyRoute>
                <LandingPage />
            </LazyRoute>
        );
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
    return (
        <LazyRoute>
            <RecoveryKeySetup />
        </LazyRoute>
    );
};

const GoogleHouseSelectRoute = () => {
    const { user, loading, mustAcceptLegal } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (!user) return <Navigate to="/login" replace />;
    if (mustAcceptLegal) return <Navigate to="/legal-consent" replace />;
    return (
        <LazyRoute>
            <GoogleHouseSelect />
        </LazyRoute>
    );
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
    return (
        <LazyRoute>
            <LegalConsent />
        </LazyRoute>
    );
};

function AppRoutes() {
    return (
        <Routes>
            <Route path="/landing" element={<LandingRoute />} />
            <Route path="/login" element={<PublicRoute><LazyRoute><Login /></LazyRoute></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><LazyRoute><Register /></LazyRoute></PublicRoute>} />
            <Route path="/forgot-password" element={<PublicRoute><LazyRoute><ForgotPassword /></LazyRoute></PublicRoute>} />
            <Route path="/reset-password" element={<PublicRoute><LazyRoute><ResetPassword /></LazyRoute></PublicRoute>} />
            <Route path="/google-house-select" element={<GoogleHouseSelectRoute />} />
            <Route path="/recovery-key-setup" element={<RecoveryKeySetupRoute />} />
            <Route path="/house-access" element={<HouseAccessRoute />} />
            <Route path="/legal-consent" element={<LegalConsentRoute />} />
            <Route path="/privacy-policy" element={<LazyRoute><PrivacyPolicy /></LazyRoute>} />
            <Route path="/terms-of-service" element={<LazyRoute><TermsOfService /></LazyRoute>} />
            <Route path="/" element={<RootRoute />}>
                <Route index element={<HomeIndexRoute />} />
                <Route path="items" element={<LazyRoute><ItemList /></LazyRoute>} />
                <Route path="maintenance" element={<LazyRoute><MaintenancePage /></LazyRoute>} />
                <Route path="shopping" element={<LazyRoute><ShoppingListPage /></LazyRoute>} />
                <Route path="borrow-requests" element={<LazyRoute><BorrowRequestsPage /></LazyRoute>} />
                <Route path="vault" element={<LazyRoute><PersonalVault /></LazyRoute>} />
                <Route path="items/new" element={<LazyRoute><ItemForm /></LazyRoute>} />
                <Route path="items/:id/edit" element={<LazyRoute><ItemForm /></LazyRoute>} />
                <Route path="categories" element={<LazyRoute><CategoryManager /></LazyRoute>} />
                <Route path="rooms" element={<LazyRoute><RoomManager /></LazyRoute>} />
                <Route path="settings" element={<LazyRoute><Settings /></LazyRoute>} />
                <Route path="admin" element={<AdminRoute><LazyRoute><AdminPanel /></LazyRoute></AdminRoute>} />
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
                        <AppRoutes />
                    </Router>
                </VaultProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}

export default App;
