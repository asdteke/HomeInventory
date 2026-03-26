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

const FullscreenSpinner = () => (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="spinner"></div>
    </div>
);

const ProtectedRoute = ({ children }) => {
    const { user, loading, mustSetupRecoveryKey } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (!user) return <Navigate to="/landing" replace />;
    if (mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
    return children;
};

const ActiveMembershipRoute = ({ children }) => {
    const { user, loading, membershipState, mustSetupRecoveryKey } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (!user) return <Navigate to="/landing" replace />;
    if (mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
    if (membershipState !== 'active') return <Navigate to="/house-access" replace />;
    return children;
};

const HouseAccessRoute = () => {
    const { user, loading, membershipState, mustSetupRecoveryKey } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (!user) return <Navigate to="/landing" replace />;
    if (mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
    if (membershipState === 'active') return <Navigate to="/" replace />;
    return <HouseAccessPending />;
};

const AdminRoute = ({ children }) => {
    const { user, loading, isAdmin, mustSetupRecoveryKey } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (!user) return <Navigate to="/landing" replace />;
    if (mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
    if (!isAdmin) return <Navigate to="/" replace />;
    return children;
};

const PublicRoute = ({ children }) => {
    const { user, loading, mustSetupRecoveryKey } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (user && mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
    if (user) return <Navigate to="/" replace />;
    return children;
};

const LandingRoute = () => {
    const { user, loading, mustSetupRecoveryKey } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (user && mustSetupRecoveryKey) return <Navigate to="/recovery-key-setup" replace />;
    if (user) return <Navigate to="/" replace />;
    return <LandingPage />;
};

const RecoveryKeySetupRoute = () => {
    const { user, loading, mustSetupRecoveryKey, passwordRecoveryMode, membershipState } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (!user) return <Navigate to="/login" replace />;
    if (passwordRecoveryMode !== 'recovery_key' || !mustSetupRecoveryKey) {
        return <Navigate to={membershipState === 'active' ? '/' : '/house-access'} replace />;
    }
    return <RecoveryKeySetup />;
};

const GoogleHouseSelectRoute = () => {
    const { user, loading } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (!user) return <Navigate to="/login" replace />;
    return <GoogleHouseSelect />;
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
            <Route path="/" element={<ActiveMembershipRoute><Layout /></ActiveMembershipRoute>}>
                <Route index element={<Dashboard />} />
                <Route path="items" element={<ItemList />} />
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
                        <AppRoutes />
                    </Router>
                </VaultProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}

export default App;
