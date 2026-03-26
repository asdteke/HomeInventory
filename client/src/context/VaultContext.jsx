import { createContext, useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import {
    createPersonalVaultSetup,
    decryptPersonalVaultPayload,
    encryptPersonalVaultPayload,
    unlockPersonalVaultWithPassphrase,
    unlockPersonalVaultWithRecoveryKey
} from '../utils/personalVaultCrypto';

const VaultContext = createContext(null);

export function useVault() {
    const context = useContext(VaultContext);
    if (!context) {
        throw new Error('useVault must be used within a VaultProvider');
    }

    return context;
}

export function VaultProvider({ children }) {
    const { user } = useAuth();
    const vaultKeyRef = useRef(null);
    const [vaultConfigured, setVaultConfigured] = useState(false);
    const [vaultConfig, setVaultConfig] = useState(null);
    const [vaultItemCount, setVaultItemCount] = useState(0);
    const [vaultUnlocked, setVaultUnlocked] = useState(false);
    const [vaultLoading, setVaultLoading] = useState(true);

    const lockVault = () => {
        vaultKeyRef.current = null;
        setVaultUnlocked(false);
    };

    const clearVaultState = () => {
        lockVault();
        setVaultConfigured(false);
        setVaultConfig(null);
        setVaultItemCount(0);
    };

    const refreshVaultStatus = async () => {
        if (!user) {
            clearVaultState();
            setVaultLoading(false);
            return null;
        }

        setVaultLoading(true);
        try {
            const response = await axios.get('/api/vault');
            setVaultConfigured(Boolean(response.data.configured));
            setVaultConfig(response.data.config || null);
            setVaultItemCount(Number(response.data.itemCount || 0));
            return response.data;
        } catch (error) {
            console.error('Vault status fetch failed:', error);
            clearVaultState();
            return null;
        } finally {
            setVaultLoading(false);
        }
    };

    useEffect(() => {
        refreshVaultStatus();
    }, [user?.id]);

    const setupVault = async (passphrase) => {
        const setupResult = await createPersonalVaultSetup(passphrase);
        const response = await axios.post('/api/vault/setup', setupResult.setupPayload);
        vaultKeyRef.current = setupResult.vaultKey;
        setVaultUnlocked(true);
        setVaultConfigured(Boolean(response.data?.configured));
        setVaultConfig(response.data?.config || null);
        setVaultItemCount(0);
        return {
            recoveryKey: setupResult.recoveryKey
        };
    };

    const unlockWithPassphrase = async (passphrase) => {
        if (!vaultConfig) {
            throw new Error('Personal vault bilgisi bulunamadi.');
        }

        vaultKeyRef.current = await unlockPersonalVaultWithPassphrase(vaultConfig, passphrase);
        setVaultUnlocked(true);
    };

    const unlockWithRecoveryKey = async (recoveryKey) => {
        if (!vaultConfig) {
            throw new Error('Personal vault bilgisi bulunamadi.');
        }

        vaultKeyRef.current = await unlockPersonalVaultWithRecoveryKey(vaultConfig, recoveryKey);
        setVaultUnlocked(true);
    };

    const encryptPayload = async (payload) => {
        if (!vaultKeyRef.current) {
            throw new Error('Vault kilitli.');
        }

        return encryptPersonalVaultPayload(vaultKeyRef.current, payload);
    };

    const decryptPayload = async (payload) => {
        if (!vaultKeyRef.current) {
            throw new Error('Vault kilitli.');
        }

        return decryptPersonalVaultPayload(vaultKeyRef.current, payload);
    };

    return (
        <VaultContext.Provider
            value={{
                vaultConfigured,
                vaultConfig,
                vaultItemCount,
                vaultUnlocked,
                vaultLoading,
                refreshVaultStatus,
                setupVault,
                unlockWithPassphrase,
                unlockWithRecoveryKey,
                encryptPayload,
                decryptPayload,
                lockVault
            }}
        >
            {children}
        </VaultContext.Provider>
    );
}

