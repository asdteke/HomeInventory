import React from 'react';

interface PremiumCheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
    boxClassName?: string;
}

export const PremiumCheckbox: React.FC<PremiumCheckboxProps> = ({
    boxClassName = '',
    className = '',
    ...props
}) => {
    return (
        <>
            <input
                {...props}
                type="checkbox"
                className={`app-premium-checkbox-input ${className}`}
            />
            <span className={`app-premium-checkbox-box mt-0.5 ${boxClassName}`}>
                <svg
                    className="app-premium-checkbox-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                >
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </span>
        </>
    );
};
