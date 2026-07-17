import { useState, useEffect } from 'react';
import Joyride, { STATUS, EVENTS, CallBackProps, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { KeyRound, PackageSearch, Tags } from 'lucide-react';
import '../vault-settings-v25.css';

const INTRO_TOUR_BOOT_FLAG = '__homeInventoryIntroBooted';
const INTRO_TOUR_OPT_IN_KEY = 'enableIntroTour';

export default function IntroTour() {
    const { t } = useTranslation();
    const [run, setRun] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [reduceMotion, setReduceMotion] = useState(() => (
        typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ));

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        const handleMotionPreference = (event: MediaQueryListEvent) => setReduceMotion(event.matches);
        mediaQuery.addEventListener('change', handleMotionPreference);
        return () => mediaQuery.removeEventListener('change', handleMotionPreference);
    }, []);

    useEffect(() => {
        const autoStartEnabled = localStorage.getItem(INTRO_TOUR_OPT_IN_KEY) === 'true';
        if (!autoStartEnabled) {
            return;
        }

        // Check if user has seen the tour
        const hasSeenTour = localStorage.getItem('hasSeenIntroTour');
        if (!hasSeenTour && !(window as any)[INTRO_TOUR_BOOT_FLAG]) {
            (window as any)[INTRO_TOUR_BOOT_FLAG] = true;
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

    const handleJoyrideCallback = (data: CallBackProps) => {
        const { status, type, index } = data;

        // Handle step changes
        if (type === EVENTS.STEP_AFTER) {
            setStepIndex(index + 1);
        }

        // Handle tour completion
        if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status as any)) {
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

    const steps: Step[] = [
        {
            target: '#intro-inventory',
            content: (
                <div className="intro-tour-v25">
                    <span className="intro-tour-v25__icon" aria-hidden="true"><PackageSearch /></span>
                    <div>
                        <h3>{t('intro.inventory.title')}</h3>
                        <p>{t('intro.inventory.content')}</p>
                    </div>
                </div>
            ),
            disableBeacon: true,
            placement: 'right',
            spotlightClicks: true,
        },
        {
            target: '#intro-house-key',
            content: (
                <div className="intro-tour-v25">
                    <span className="intro-tour-v25__icon" aria-hidden="true"><KeyRound /></span>
                    <div>
                        <h3>{t('intro.house_key.title')}</h3>
                        <p>{t('intro.house_key.content')}</p>
                    </div>
                </div>
            ),
            placement: 'right',
            spotlightClicks: true,
        },
        {
            target: '#intro-categories',
            content: (
                <div className="intro-tour-v25">
                    <span className="intro-tour-v25__icon" aria-hidden="true"><Tags /></span>
                    <div>
                        <h3>{t('intro.categories.title')}</h3>
                        <p>{t('intro.categories.content')}</p>
                    </div>
                </div>
            ),
            placement: 'right',
            spotlightClicks: true,
        },
    ];

    const joyrideStyles = {
        options: {
            primaryColor: 'var(--hi-accent)',
            zIndex: 10000,
            arrowColor: 'var(--hi-panel-strong)',
            backgroundColor: 'var(--hi-panel-strong)',
            textColor: 'var(--hi-text)',
            overlayColor: 'rgba(9, 14, 11, 0.58)',
        },
        tooltip: {
            borderRadius: 24,
            padding: 0,
            backgroundColor: 'var(--hi-panel-strong)',
            color: 'var(--hi-text)',
            border: '1px solid var(--hi-border-strong)',
            boxShadow: 'var(--hi-shadow)',
            overflow: 'hidden',
        },
        tooltipContainer: {
            textAlign: 'left' as const,
        },
        tooltipContent: {
            color: 'var(--hi-text-soft)',
            padding: 0,
        },
        buttonNext: {
            borderRadius: 999,
            padding: '11px 20px',
            backgroundColor: 'var(--hi-accent)',
            color: '#ffffff',
            fontWeight: 650,
            outlineOffset: 3,
        },
        buttonBack: {
            borderRadius: 999,
            marginRight: 10,
            color: 'var(--hi-text-soft)',
            fontWeight: 600,
        },
        buttonSkip: {
            borderRadius: 999,
            color: 'var(--hi-text-soft)',
        },
        buttonClose: {
            color: 'var(--hi-text-soft)',
        },
        spotlight: {
            borderRadius: 20,
            boxShadow: '0 0 0 3px var(--hi-accent), 0 0 0 9999px rgba(9, 14, 11, 0.58)',
        },
        beacon: {
            display: 'none',
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
                disableAnimation: reduceMotion,
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
