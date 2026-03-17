import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';

import LandingPage from './components/LandingPage';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import ItemList from './components/ItemList';
import ItemForm from './components/ItemForm';
import CategoryManager from './components/CategoryManager';
import RoomManager from './components/RoomManager';
import Settings from './components/Settings';
import Layout from './components/Layout';
import AdminPanel from './components/AdminPanel';
import GoogleHouseSelect from './components/GoogleHouseSelect';

const FullscreenSpinner = () => (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="spinner"></div>
    </div>
);

const ProtectedRoute = ({ children }) => {
    const { user, loading } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (!user) return <Navigate to="/landing" replace />;
    return children;
};

const AdminRoute = ({ children }) => {
    const { user, loading, isAdmin } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (!user) return <Navigate to="/landing" replace />;
    if (!isAdmin) return <Navigate to="/" replace />;
    return children;
};

const PublicRoute = ({ children }) => {
    const { user, loading } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (user) return <Navigate to="/" replace />;
    return children;
};

const LandingRoute = () => {
    const { user, loading } = useAuth();
    if (loading) return <FullscreenSpinner />;
    if (user) return <Navigate to="/" replace />;
    return <LandingPage />;
};

function AppRoutes() {
    return (
        <Routes>
            <Route path="/landing" element={<LandingRoute />} />
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/google-house-select" element={<GoogleHouseSelect />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route index element={<Dashboard />} />
                <Route path="items" element={<ItemList />} />
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
                <Router>
                    <AppRoutes />
                </Router>
            </AuthProvider>
        </ThemeProvider>
    );
}

export default App;
