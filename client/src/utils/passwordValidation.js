import { PASSWORD_MIN_LENGTH } from '../constants/branding.js';

export const MIN_PASSWORD_LENGTH = PASSWORD_MIN_LENGTH;
export const RECOMMENDED_PASSWORD_LENGTH = 12;

export function getPasswordGuidanceMessage(t) {
    return t('auth.password_guidance_v270', {
        min: MIN_PASSWORD_LENGTH,
        recommended: RECOMMENDED_PASSWORD_LENGTH,
        defaultValue: 'Minimum {{min}} characters. {{recommended}} or more is recommended; spaces are allowed.'
    });
}

export function validatePasswordStrengthClient(password, t) {
    const value = String(password || '');
    const guidanceMessage = getPasswordGuidanceMessage(t);

    if (value.length < MIN_PASSWORD_LENGTH) {
        return {
            valid: false,
            error: guidanceMessage,
            recommended: false
        };
    }

    return {
        valid: true,
        error: '',
        recommended: value.length >= RECOMMENDED_PASSWORD_LENGTH
    };
}
