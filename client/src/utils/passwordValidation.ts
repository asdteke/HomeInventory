export const MIN_PASSWORD_LENGTH = 10;

export interface PasswordValidationResult {
    valid: boolean;
    error: string;
}

function getPasswordRequirementsMessage(t: (key: string, options?: any) => string): string {
    return t('auth.password_requirements', {
        min: MIN_PASSWORD_LENGTH,
        defaultValue: 'Use at least {{min}} characters with uppercase, lowercase, number, and symbol.'
    });
}

export function validatePasswordStrengthClient(
    password: string | null | undefined,
    t: (key: string, options?: any) => string
): PasswordValidationResult {
    const value = String(password || '');
    const requirementsMessage = getPasswordRequirementsMessage(t);

    if (value.length < MIN_PASSWORD_LENGTH) {
        return {
            valid: false,
            error: requirementsMessage
        };
    }

    if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value) || !/[^a-zA-Z0-9]/.test(value)) {
        return {
            valid: false,
            error: requirementsMessage
        };
    }

    return {
        valid: true,
        error: ''
    };
}
