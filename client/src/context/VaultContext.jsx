import { createContext, useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import {
    createPersonalVaultSetup,
    decryptPersonalVaultBytes,
    decryptPersonalVaultPayload,
    encryptPersonalVaultBytes,
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
        return {
            recoveryKey: setupResult.recoveryKey
        };
    };

    const unlockWithPassphrase = async (passphrase) => {
        if (!vaultConfig) {
            throw new Error('Personal vault configuration could not be found.');
        }

        vaultKeyRef.current = await unlockPersonalVaultWithPassphrase(vaultConfig, passphrase);
        setVaultUnlocked(true);
    };

    const unlockWithRecoveryKey = async (recoveryKey) => {
        if (!vaultConfig) {
            throw new Error('Personal vault configuration could not be found.');
        }

        vaultKeyRef.current = await unlockPersonalVaultWithRecoveryKey(vaultConfig, recoveryKey);
        setVaultUnlocked(true);
    };

    const encryptPayload = async (payload) => {
        if (!vaultKeyRef.current) {
            throw new Error('Vault is locked.');
        }

        return encryptPersonalVaultPayload(vaultKeyRef.current, payload);
    };

    const decryptPayload = async (payload) => {
        if (!vaultKeyRef.current) {
            throw new Error('Vault is locked.');
        }

        return decryptPersonalVaultPayload(vaultKeyRef.current, payload);
    };

    const encryptBytes = async (payload) => {
        if (!vaultKeyRef.current) {
            throw new Error('Vault is locked.');
        }

        return encryptPersonalVaultBytes(vaultKeyRef.current, payload);
    };

    const decryptBytes = async (payload) => {
        if (!vaultKeyRef.current) {
            throw new Error('Vault is locked.');
        }

        return decryptPersonalVaultBytes(vaultKeyRef.current, payload);
    };

    return (
        <VaultContext.Provider
            value={{
                vaultConfigured,
                vaultConfig,
                vaultUnlocked,
                vaultLoading,
                refreshVaultStatus,
                setupVault,
                unlockWithPassphrase,
                unlockWithRecoveryKey,
                encryptPayload,
                decryptPayload,
                encryptBytes,
                decryptBytes,
                lockVault
            }}
        >
            {children}
        </VaultContext.Provider>
    );
}
