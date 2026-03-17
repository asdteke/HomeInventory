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

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    // Configure axios defaults
    useEffect(() => {
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        } else {
            delete axios.defaults.headers.common['Authorization'];
        }
    }, [token]);

    // Check auth on mount
    useEffect(() => {
        const checkAuth = async () => {
            if (token) {
                try {
                    const response = await axios.get('/api/auth/me');
                    setUser(response.data.user);
                } catch (error) {
                    console.error('Auth check failed:', error);
                    logout();
                }
            }
            setLoading(false);
        };
        checkAuth();
    }, []);

    const login = async (username, password) => {
        const response = await axios.post('/api/auth/login', { username, password });
        const { user, token } = response.data;

        localStorage.setItem('token', token);
        setToken(token);
        setUser(user);

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
            // Return the response without setting token/user
            return {
                ...response.data,
                requiresEmailVerification: true
            };
        }

        // Legacy: If token is provided (shouldn't happen now), handle it
        const { user, token, isNewHouse, house_key: responseKey } = response.data;
        if (token) {
            localStorage.setItem('token', token);
            setToken(token);
            setUser(user);
        }

        return { ...response.data, isNewHouse, house_key: responseKey };
    };

    const googleLogin = async (token) => {
        localStorage.setItem('token', token);
        setToken(token);

        try {
            const response = await axios.get('/api/auth/me', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUser(response.data.user);
            return response.data;
        } catch (error) {
            console.error('Google login error:', error);
            logout();
            throw error;
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        delete axios.defaults.headers.common['Authorization'];
    };

    const isAdmin = user?.role === 'admin';

    // Update token and refresh user data (used for house switching)
    const updateToken = async (newToken) => {
        localStorage.setItem('token', newToken);
        setToken(newToken);
        axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

        try {
            const response = await axios.get('/api/auth/me');
            setUser(response.data.user);
            return response.data.user;
        } catch (error) {
            console.error('Token update failed:', error);
            throw error;
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, loading, login, register, googleLogin, logout, isAdmin, updateToken }}>
            {children}
        </AuthContext.Provider>
    );
};
