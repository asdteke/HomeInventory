import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

// Configure axios to always send cookies
axios.defaults.withCredentials = true;

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [membershipState, setMembershipState] = useState('no_house');
    const [pendingHouseRequest, setPendingHouseRequest] = useState(null);
    const [houseMemberCount, setHouseMemberCount] = useState(0);
    const [passwordRecoveryMode, setPasswordRecoveryMode] = useState('email');
    const [hasRecoveryKey, setHasRecoveryKey] = useState(false);
    const [mustSetupRecoveryKey, setMustSetupRecoveryKey] = useState(false);
    const [loading, setLoading] = useState(true);

    const fetchUser = async () => {
        try {
            const response = await axios.get('/api/auth/me');
            setUser(response.data.user);
            setMembershipState(response.data.membership_state || 'no_house');
            setPendingHouseRequest(response.data.pending_house_request || null);
            setHouseMemberCount(response.data.houseMemberCount || 0);
            setPasswordRecoveryMode(response.data.password_recovery_mode || 'email');
            setHasRecoveryKey(Boolean(response.data.has_recovery_key));
            setMustSetupRecoveryKey(Boolean(response.data.must_setup_recovery_key));
            return response.data.user;
        } catch (error) {
            console.error('Auth check failed:', error);
            setUser(null);
            setMembershipState('no_house');
            setPendingHouseRequest(null);
            setHouseMemberCount(0);
            setPasswordRecoveryMode('email');
            setHasRecoveryKey(false);
            setMustSetupRecoveryKey(false);
            return null;
        }
    };

    // Check auth on mount
    useEffect(() => {
        const checkAuth = async () => {
            await fetchUser();
            setLoading(false);
        };
        checkAuth();
    }, []);

    const login = async (username, password) => {
        const response = await axios.post('/api/auth/login', { username, password });
        await fetchUser();
        return response.data;
    };

    const register = async (username, email, password, mode = 'create', house_key = null) => {
        const payload = { username, email, password, mode };
        if (mode === 'join' && house_key) {
            payload.house_key = house_key;
        }

        const response = await axios.post('/api/auth/register', payload);

        // If email verification is required, don't auto-login
        if (response.data.requiresEmailVerification) {
            return {
                ...response.data,
                requiresEmailVerification: true
            };
        }

        return response.data;
    };

    const logout = async () => {
        try {
            await axios.post('/api/auth/logout');
        } catch(err) {
            console.error('Logout error:', err);
        } finally {
            setUser(null);
            setMembershipState('no_house');
            setPendingHouseRequest(null);
            setHouseMemberCount(0);
            setPasswordRecoveryMode('email');
            setHasRecoveryKey(false);
            setMustSetupRecoveryKey(false);
        }
    };

    const isAdmin = user?.role === 'admin';

    // Refresh user data (used for house switching, Google complete, etc)
    const refreshUser = async () => {
        return await fetchUser();
    };

    return (
        <AuthContext.Provider value={{
            user,
            loading,
            membershipState,
            pendingHouseRequest,
            houseMemberCount,
            passwordRecoveryMode,
            hasRecoveryKey,
            mustSetupRecoveryKey,
            login,
            register,
            logout,
            isAdmin,
            refreshUser,
            fetchUser
        }}>
            {children}
        </AuthContext.Provider>
    );
};
