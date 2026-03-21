import { useState, useEffect } from 'react';
import Joyride, { STATUS, EVENTS } from 'react-joyride';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';

const INTRO_TOUR_BOOT_FLAG = '__homeInventoryIntroBooted';

export default function IntroTour() {
    const { t } = useTranslation();
    const [run, setRun] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const { isDark } = useTheme();

    useEffect(() => {
        // Check if user has seen the tour
        const hasSeenTour = localStorage.getItem('hasSeenIntroTour');
        if (!hasSeenTour && !window[INTRO_TOUR_BOOT_FLAG]) {
            window[INTRO_TOUR_BOOT_FLAG] = true;
            // Longer delay to ensure page fully renders and sidebar is visible
            const timer = setTimeout(() => {
                // Check if target elements exist before starting
                const inventoryTarget = document.querySelector('#intro-inventory');
                if (inventoryTarget) {
                    setRun(true);
                } else {
                    // If sidebar targets don't exist (mobile), use dashboard-based tour
                    console.log('Sidebar targets not found, tour will use fallback');
                    setRun(true);
                }
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleJoyrideCallback = (data) => {
        const { status, type, index } = data;

        // Handle step changes
        if (type === EVENTS.STEP_AFTER) {
            setStepIndex(index + 1);
        }

        // Handle tour completion
        if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
            localStorage.setItem('hasSeenIntroTour', 'true');
            setRun(false);
            setStepIndex(0);
        }

        // Handle errors (like target not found)
        if (type === EVENTS.TARGET_NOT_FOUND) {
            // Skip to next step if target not found
            setStepIndex(index + 1);
        }
    };

    const steps = [
        {
            target: '#intro-inventory',
            content: (
                <div className="text-center">
                    <div className="text-4xl mb-3">📦</div>
                    <h3 className="text-lg font-bold mb-2">{t('intro.inventory.title')}</h3>
                    <p className="text-sm">{t('intro.inventory.content')}</p>
                </div>
            ),
            disableBeacon: true,
            placement: 'right',
            spotlightClicks: true,
        },
        {
            target: '#intro-house-key',
            content: (
                <div className="text-center">
                    <div className="text-4xl mb-3">🔑</div>
                    <h3 className="text-lg font-bold mb-2">{t('intro.house_key.title')}</h3>
                    <p className="text-sm">{t('intro.house_key.content')}</p>
                </div>
            ),
            placement: 'right',
            spotlightClicks: true,
        },
        {
            target: '#intro-categories',
            content: (
                <div className="text-center">
                    <div className="text-4xl mb-3">🏷️</div>
                    <h3 className="text-lg font-bold mb-2">{t('intro.categories.title')}</h3>
                    <p className="text-sm">{t('intro.categories.content')}</p>
                </div>
            ),
            placement: 'right',
            spotlightClicks: true,
        },
    ];

    // Dark theme aware styles
    const joyrideStyles = {
        options: {
            primaryColor: '#8b5cf6',
            zIndex: 10000,
            arrowColor: isDark ? '#1e293b' : '#ffffff',
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            textColor: isDark ? '#e2e8f0' : '#1e293b',
            overlayColor: 'rgba(0, 0, 0, 0.5)',
        },
        tooltip: {
            borderRadius: 16,
            padding: 20,
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            color: isDark ? '#e2e8f0' : '#1e293b',
            boxShadow: isDark
                ? '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(148, 163, 184, 0.1)'
                : '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        },
        tooltipContainer: {
            textAlign: 'center',
        },
        tooltipTitle: {
            color: isDark ? '#f1f5f9' : '#0f172a',
            fontWeight: 700,
        },
        tooltipContent: {
            color: isDark ? '#cbd5e1' : '#475569',
            padding: '10px 0',
        },
        buttonNext: {
            borderRadius: 12,
            padding: '10px 20px',
            backgroundColor: '#8b5cf6',
            color: '#ffffff',
            fontWeight: 500,
        },
        buttonBack: {
            borderRadius: 12,
            marginRight: 10,
            color: isDark ? '#94a3b8' : '#64748b',
        },
        buttonSkip: {
            borderRadius: 12,
            color: isDark ? '#94a3b8' : '#64748b',
        },
        buttonClose: {
            color: isDark ? '#94a3b8' : '#64748b',
        },
        spotlight: {
            borderRadius: 16,
        },
        beacon: {
            display: 'none', // Hide beacons, start immediately
        },
    };

    return (
        <Joyride
            steps={steps}
            run={run}
            stepIndex={stepIndex}
            continuous
            showProgress
            showSkipButton
            scrollToFirstStep
            disableScrolling={false}
            callback={handleJoyrideCallback}
            styles={joyrideStyles}
            floaterProps={{
                disableAnimation: false,
            }}
            locale={{
                back: t('intro.buttons.back'),
                close: t('intro.buttons.close'),
                last: t('intro.buttons.last'),
                next: t('intro.buttons.next'),
                open: t('intro.buttons.open') || 'Aç', // Fallback defaults
                skip: t('intro.buttons.skip'),
            }}
        />
    );
}
