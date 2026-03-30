import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { VaultProvider } from './context/VaultContext';

import LandingPage from './components/LandingPage';
import Login from './components/Login';
import Register from './components/Register';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import Dashboard from './components/Dashboard';
import ItemList from './components/ItemList';
import ItemForm from './components/ItemForm';
import CategoryManager from './components/CategoryManager';
import RoomManager from './components/RoomManager';
import Settings from './components/Settings';
import Layout from './components/Layout';
import AdminPanel from './components/AdminPanel';
import GoogleHouseSelect from './components/GoogleHouseSelect';
import HouseAccessPending from './components/HouseAccessPending';
import RecoveryKeySetup from './components/RecoveryKeySetup';
import PersonalVault from './components/PersonalVault';
import BorrowRequestsPage from './components/BorrowRequestsPage';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsOfService from './components/TermsOfService';
import CookieBanner from './components/CookieBanner';
import LegalConsent from './components/LegalConsent';

const FullscreenSpinner = () => (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="spinner"></div>
    </div>
);

const ProtectedRoute = ({ children }) => {
    const { user, loading, mustSetupRecoveryKey, mustAcceptLegal } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (!user) return <Navigate to="/landing" replace />;
    if (mustAcceptLegal) return <Navigate to="/legal-consent" replace />;
    if (mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
    return children;
};

const ActiveMembershipRoute = ({ children }) => {
    const { user, loading, membershipState, mustSetupRecoveryKey, mustAcceptLegal } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (!user) return <Navigate to="/landing" replace />;
    if (mustAcceptLegal) return <Navigate to="/legal-consent" replace />;
    if (mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
    if (membershipState !== 'active') return <Navigate to="/house-access" replace />;
    return children;
};

const HouseAccessRoute = () => {
    const { user, loading, membershipState, mustSetupRecoveryKey, mustAcceptLegal } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (!user) return <Navigate to="/landing" replace />;
    if (mustAcceptLegal) return <Navigate to="/legal-consent" replace />;
    if (mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
    if (membershipState === 'active') return <Navigate to="/" replace />;
    return <HouseAccessPending />;
};

const AdminRoute = ({ children }) => {
    const { user, loading, isAdmin, mustSetupRecoveryKey, mustAcceptLegal } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (!user) return <Navigate to="/landing" replace />;
    if (mustAcceptLegal) return <Navigate to="/legal-consent" replace />;
    if (mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
    if (!isAdmin) return <Navigate to="/" replace />;
    return children;
};

const PublicRoute = ({ children }) => {
    const { user, loading, mustSetupRecoveryKey, mustAcceptLegal } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (user && mustAcceptLegal) return <Navigate to="/legal-consent" replace />;
    if (user && mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
    if (user) return <Navigate to="/" replace />;
    return children;
};

const LandingRoute = () => {
    const { user, loading, mustSetupRecoveryKey, mustAcceptLegal } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (user && mustAcceptLegal) return <Navigate to="/legal-consent" replace />;
    if (user && mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
    if (user) return <Navigate to="/" replace />;
    return <LandingPage />;
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
            <Route path="/" element={<ActiveMembershipRoute><Layout /></ActiveMembershipRoute>}>
                <Route index element={<Dashboard />} />
                <Route path="items" element={<ItemList />} />
                <Route path="borrow-requests" element={<BorrowRequestsPage />} />
                <Route path="vault" element={<PersonalVault />} />
                <Route path="items/new" element={<ItemForm />} />
                <Route path="items/:id/edit" element={<ItemForm />} />
                <Route path="categories" element={<CategoryManager />} />
                <Route path="rooms" element={<RoomManager />} />
                <Route path="settings" element={<Settings />} />
                <Route path="admin/mail-gonder" element={<AdminRoute><AdminPanel /></AdminRoute>} />
            </Route>
            <Route path="*" element={<Navigate to="/landing" replace />} />
        </Routes>
    );
}

function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <VaultProvider>
                    <Router>
                        <CookieBanner />
                        <AppRoutes />
                    </Router>
                </VaultProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}

export default App;
