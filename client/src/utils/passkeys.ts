import axios from 'axios';

// Browser side of passkey (WebAuthn) sign-in. The server sends options as JSON with
// base64url strings; the browser API wants ArrayBuffers, and the reverse on the way back.

export type PasskeyUnavailableReason = 'disabled' | 'ip_address' | 'insecure_origin' | 'origin_not_allowed' | 'unknown_origin' | 'unsupported_browser' | null;

export interface PasskeyConfig {
    enabled: boolean;
    available: boolean;
    reason: PasskeyUnavailableReason;
}

export interface PasskeySummary {
    id: number;
    name: string;
    deviceType: string | null;
    backedUp: boolean;
    rpId: string;
    createdAt: string;
    lastUsedAt: string | null;
    usableHere: boolean;
}

export interface PasskeyListResponse extends PasskeyConfig {
    passkeys: PasskeySummary[];
}

export interface PasskeyReauthentication {
    password: string;
    totpCode?: string;
}

function base64UrlToBuffer(value: string): ArrayBuffer {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
}

function bufferToBase64Url(buffer: ArrayBuffer | null | undefined): string | undefined {
    if (!buffer) {
        return undefined;
    }
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function browserSupportsPasskeys(): boolean {
    return typeof window !== 'undefined'
        && window.isSecureContext
        && typeof window.PublicKeyCredential === 'function'
        && typeof navigator.credentials?.create === 'function';
}

export function isPasskeyCancellation(error: unknown): boolean {
    const name = (error as { name?: string })?.name;
    return name === 'NotAllowedError' || name === 'AbortError';
}

function toCreationOptions(options: any): PublicKeyCredentialCreationOptions {
    return {
        ...options,
        challenge: base64UrlToBuffer(options.challenge),
        user: { ...options.user, id: base64UrlToBuffer(options.user.id) },
        excludeCredentials: (options.excludeCredentials || []).map((credential: any) => ({
            ...credential,
            id: base64UrlToBuffer(credential.id)
        }))
    };
}

function toRequestOptions(options: any): PublicKeyCredentialRequestOptions {
    return {
        ...options,
        challenge: base64UrlToBuffer(options.challenge),
        allowCredentials: (options.allowCredentials || []).map((credential: any) => ({
            ...credential,
            id: base64UrlToBuffer(credential.id)
        }))
    };
}

function serializeCredential(credential: PublicKeyCredential) {
    const response = credential.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse;
    const serializedResponse: Record<string, unknown> = {
        clientDataJSON: bufferToBase64Url(response.clientDataJSON)
    };

    if ('attestationObject' in response && response.attestationObject) {
        serializedResponse.attestationObject = bufferToBase64Url(response.attestationObject);
        serializedResponse.transports = typeof response.getTransports === 'function' ? response.getTransports() : [];
    } else {
        serializedResponse.authenticatorData = bufferToBase64Url(response.authenticatorData);
        serializedResponse.signature = bufferToBase64Url(response.signature);
        serializedResponse.userHandle = bufferToBase64Url(response.userHandle);
    }

    return {
        id: credential.id,
        rawId: bufferToBase64Url(credential.rawId),
        type: credential.type,
        authenticatorAttachment: credential.authenticatorAttachment || undefined,
        clientExtensionResults: credential.getClientExtensionResults?.() || {},
        response: serializedResponse
    };
}

export async function fetchPasskeyConfig(): Promise<PasskeyConfig> {
    if (!browserSupportsPasskeys()) {
        return { enabled: true, available: false, reason: 'unsupported_browser' };
    }
    const response = await axios.get('/api/auth/passkeys/config');
    return response.data;
}

export async function signInWithPasskey() {
    const { data } = await axios.post('/api/auth/passkeys/login/options', {});
    const credential = await navigator.credentials.get({
        publicKey: toRequestOptions(data.options)
    }) as PublicKeyCredential | null;

    if (!credential) {
        throw Object.assign(new Error('Passkey sign-in was cancelled'), { name: 'NotAllowedError' });
    }

    const result = await axios.post('/api/auth/passkeys/login/verify', {
        challengeId: data.challengeId,
        response: serializeCredential(credential)
    });
    return result.data;
}

export async function listPasskeys(): Promise<PasskeyListResponse> {
    const response = await axios.get('/api/auth/passkeys');
    const data = response.data as PasskeyListResponse;
    if (!browserSupportsPasskeys() && data.available) {
        return { ...data, available: false, reason: 'unsupported_browser' };
    }
    return data;
}

export async function addPasskey(name: string, reauthentication: PasskeyReauthentication): Promise<PasskeySummary[]> {
    const { data } = await axios.post('/api/auth/passkeys/register/options', reauthentication);
    const credential = await navigator.credentials.create({
        publicKey: toCreationOptions(data.options)
    }) as PublicKeyCredential | null;

    if (!credential) {
        throw Object.assign(new Error('Passkey creation was cancelled'), { name: 'NotAllowedError' });
    }

    const result = await axios.post('/api/auth/passkeys/register/verify', {
        challengeId: data.challengeId,
        response: serializeCredential(credential),
        name
    });
    return result.data.passkeys;
}

export async function renamePasskey(id: number, name: string): Promise<PasskeySummary[]> {
    const response = await axios.patch(`/api/auth/passkeys/${id}`, { name });
    return response.data.passkeys;
}

export async function removePasskey(id: number, reauthentication: PasskeyReauthentication): Promise<PasskeySummary[]> {
    const response = await axios.delete(`/api/auth/passkeys/${id}`, { data: reauthentication });
    return response.data.passkeys;
}
