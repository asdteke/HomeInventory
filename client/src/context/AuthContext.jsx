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
    const [loading, setLoading] = useState(true);

    const fetchUser = async () => {
        try {
            const response = await axios.get('/api/auth/me');
            setUser(response.data.user);
            return response.data.user;
        } catch (error) {
            console.error('Auth check failed:', error);
            setUser(null);
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
        setUser(response.data.user);
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

        const { user, isNewHouse, house_key: responseKey } = response.data;
        if (user) {
            setUser(user);
        }

        return { ...response.data, isNewHouse, house_key: responseKey };
    };

    const logout = async () => {
        try {
            await axios.post('/api/auth/logout');
        } catch(err) {
            console.error('Logout error:', err);
        } finally {
            setUser(null);
        }
    };

    const isAdmin = user?.role === 'admin';

    // Refresh user data (used for house switching, Google complete, etc)
    const refreshUser = async () => {
        return await fetchUser();
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout, isAdmin, refreshUser, fetchUser }}>
            {children}
        </AuthContext.Provider>
    );
};
