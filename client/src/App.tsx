import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';

import { useTranslation } from 'react-i18next';

import BrowserBranding from './components/BrowserBranding';
import AppErrorBoundary from './components/AppErrorBoundary';
import { BRAND_NAME } from './constants/branding';

const CookieBanner = lazy(() => import('./components/CookieBanner'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const Layout = lazy(() => import('./components/Layout'));
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
const PersonalVaultRoute = lazy(() => import('./components/PersonalVaultRoute'));
const BorrowRequestsPage = lazy(() => import('./components/BorrowRequestsPage'));
const LegalConsent = lazy(() => import('./components/LegalConsent'));
const MaintenancePage = lazy(() => import('./components/MaintenancePage'));
const ShoppingListPage = lazy(() => import('./components/ShoppingListPage'));


const FullscreenSpinner = () => {
    const { t } = useTranslation();
    return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--hi-bg)] px-4 text-[var(--hi-text)]">
            <div role="status" aria-live="polite" className="w-full max-w-sm rounded-[1.35rem] border border-[var(--hi-border)] bg-[var(--hi-panel)] p-6 text-center shadow-[var(--hi-shadow-soft)]">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--hi-accent-soft)] text-[var(--hi-accent)]">
                    <span className="spinner !h-6 !w-6 !border-2" />
                </span>
                <p className="mt-4 text-sm font-semibold text-[var(--hi-text)]">{t('app.loading', { defaultValue: `Loading ${BRAND_NAME}`, brandName: BRAND_NAME })}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--hi-text-soft)]">{t('app.preparing_workspace', { defaultValue: 'Preparing your workspace...' })}</p>
            </div>
        </div>
    );
};

const DeferredCookieBanner = () => {
    const location = useLocation();
    const [shouldLoad, setShouldLoad] = useState(false);

    useEffect(() => {
        if (location.pathname === '/legal-consent') {
            setShouldLoad(false);
            return;
        }

        try {
            const dismissed = window.localStorage.getItem('cookie_notice_dismissed');
            const legacyConsent = window.localStorage.getItem('cookie_consent');
            setShouldLoad(!dismissed && !legacyConsent);
        } catch {
            setShouldLoad(false);
        }
    }, [location.pathname]);

    if (!shouldLoad) {
        return null;
    }

    return (
        <Suspense fallback={null}>
            <CookieBanner />
        </Suspense>
    );
};

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
        <Suspense fallback={<FullscreenSpinner />}>
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
                    <Route path="vault" element={<PersonalVaultRoute />} />
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
        </Suspense>
    );
}

function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                    <BrowserBranding />
                    <DeferredCookieBanner />
                    <AppErrorBoundary>
                        <AppRoutes />
                    </AppErrorBoundary>
                </Router>
            </AuthProvider>
        </ThemeProvider>
    );
}

export default App;
