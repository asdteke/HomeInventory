import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios, { AxiosError } from 'axios';

export interface User {
    id: number;
    username: string;
    email: string;
    role: string;
    house_id?: number | null;
}

export interface HouseRequest {
    id: number;
    house_id: number;
    user_id: number;
    status: string;
}

export interface AuthContextType {
    user: User | null;
    loading: boolean;
    membershipState: string;
    pendingHouseRequest: HouseRequest | null;
    houseMemberCount: number;
    passwordRecoveryMode: string;
    hasRecoveryKey: boolean;
    mustSetupRecoveryKey: boolean;
    mustAcceptLegal: boolean;
    totpEnabled: boolean;
    login: (username: string, password: string, totpCode?: string | null, rememberDevice?: boolean) => Promise<any>;
    register: (username: string, email: string, password: string, mode?: string, house_key?: string | null, legalAcceptance?: any) => Promise<any>;
    logout: () => Promise<void>;
    isAdmin: boolean;
    refreshUser: () => Promise<User | null>;
    markLegalAccepted: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

// Configure axios to always send cookies
axios.defaults.withCredentials = true;

interface CustomErrorWithResponse extends Error {
    response?: {
        data: {
            error: string;
        };
        status?: number;
    };
}

function buildClientAuthError(error: any, fallbackMessage: string): Error {
    if (axios.isAxiosError(error)) {
        if (error.response?.data?.error) {
            return error;
        }

        const networkMessage = error.code === 'ERR_NETWORK' || !error.response
            ? 'Sunucuya baglanilamadi. Yerel backend servisinin calistigindan emin olun.'
            : (error.message || fallbackMessage);

        const wrappedAxiosError = new Error(networkMessage) as CustomErrorWithResponse;
        wrappedAxiosError.cause = error;
        wrappedAxiosError.response = {
            data: {
                error: networkMessage
            }
        };
        return wrappedAxiosError;
    }

    if (error && typeof error === 'object' && error.response?.data?.error) {
        return error;
    }

    const message = error instanceof Error && error.message
        ? error.message
        : fallbackMessage;
    const wrappedError = new Error(message) as CustomErrorWithResponse;
    wrappedError.cause = error;
    wrappedError.response = {
        data: {
            error: message
        }
    };
    return wrappedError;
}

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [user, setUser] = useState<User | null>(null);
    const [membershipState, setMembershipState] = useState<string>('no_house');
    const [pendingHouseRequest, setPendingHouseRequest] = useState<HouseRequest | null>(null);
    const [houseMemberCount, setHouseMemberCount] = useState<number>(0);
    const [passwordRecoveryMode, setPasswordRecoveryMode] = useState<string>('email');
    const [hasRecoveryKey, setHasRecoveryKey] = useState<boolean>(false);
    const [mustSetupRecoveryKey, setMustSetupRecoveryKey] = useState<boolean>(false);
    const [mustAcceptLegal, setMustAcceptLegal] = useState<boolean>(false);
    const [totpEnabled, setTotpEnabled] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);

    const resetAuthState = () => {
        setUser(null);
        setMembershipState('no_house');
        setPendingHouseRequest(null);
        setHouseMemberCount(0);
        setPasswordRecoveryMode('email');
        setHasRecoveryKey(false);
        setMustSetupRecoveryKey(false);
        setMustAcceptLegal(false);
        setTotpEnabled(false);
    };

    const fetchUser = async (): Promise<User | null> => {
        try {
            const response = await axios.get('/api/auth/me');
            setUser(response.data.user);
            setMembershipState(response.data.membership_state || 'no_house');
            setPendingHouseRequest(response.data.pending_house_request || null);
            setHouseMemberCount(response.data.houseMemberCount || 0);
            setPasswordRecoveryMode(response.data.password_recovery_mode || 'email');
            setHasRecoveryKey(Boolean(response.data.has_recovery_key));
            setMustSetupRecoveryKey(Boolean(response.data.must_setup_recovery_key));
            setMustAcceptLegal(Boolean(response.data.must_accept_legal));
            setTotpEnabled(Boolean(response.data.totp_enabled));
            return response.data.user;
        } catch (error: any) {
            if (error?.response?.status === 429) {
                console.warn('Auth check rate limited; keeping current session state.');
                return user;
            }

            if (error?.response?.status !== 401) {
                console.error('Auth check failed:', error);
            }
            resetAuthState();
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

    const login = async (username: string, password: string, totpCode: string | null = null, rememberDevice = false) => {
        try {
            const payload: any = { username, password };
            if (totpCode) payload.totpCode = totpCode;
            if (rememberDevice) payload.rememberDevice = true;

            const response = await axios.post('/api/auth/login', payload);

            // If 2FA is required, return the flag without fetching user
            if (response.data.requiresTwoFactor) {
                return { requiresTwoFactor: true };
            }

            const authenticatedUser = await fetchUser();
            if (!authenticatedUser) {
                throw buildClientAuthError(null, 'Oturum doğrulanamadı');
            }

            return response.data;
        } catch (error) {
            console.error('Login failed:', error);
            throw buildClientAuthError(error, 'Giriş sırasında bir hata oluştu');
        }
    };

    const register = async (
        username: string,
        email: string,
        password: string,
        mode = 'create',
        house_key: string | null = null,
        legalAcceptance: any = {}
    ) => {
        try {
            const payload: any = { username, email, password, mode };
            if (mode === 'join' && house_key) {
                payload.house_key = house_key;
            }
            payload.acceptedTerms = legalAcceptance.acceptedTerms === true;
            payload.acknowledgedPrivacyNotice = legalAcceptance.acknowledgedPrivacyNotice === true;

            const response = await axios.post('/api/auth/register', payload);

            // If email verification is required, don't auto-login
            if (response.data.requiresEmailVerification) {
                return {
                    ...response.data,
                    requiresEmailVerification: true
                };
            }

            return response.data;
        } catch (error) {
            console.error('Register failed:', error);
            throw buildClientAuthError(error, 'Kayıt sırasında bir hata oluştu');
        }
    };

    const logout = async () => {
        try {
            await axios.post('/api/auth/logout');
        } catch(err) {
            console.error('Logout error:', err);
        } finally {
            resetAuthState();
        }
    };

    const isAdmin = user?.role === 'admin';

    // Refresh user data (used for house switching, Google complete, etc)
    const refreshUser = async () => {
        return await fetchUser();
    };

    const markLegalAccepted = () => {
        setMustAcceptLegal(false);
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
            mustAcceptLegal,
            totpEnabled,
            login,
            register,
            logout,
            isAdmin,
            refreshUser,
            markLegalAccepted,
        }}>
            {children}
        </AuthContext.Provider>
    );
};
