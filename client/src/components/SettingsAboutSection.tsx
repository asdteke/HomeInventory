import { AlertTriangle, HelpCircle, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
    APP_VERSION,
    BRAND_NAME,
    SUPPORT_CONTACT_LABEL,
    SUPPORT_CONTACT_URL
} from '../constants/branding';
import '../vault-settings-v25.css';

interface SettingsAboutSectionProps {
    onLogout: () => void | Promise<void>;
}

export default function SettingsAboutSection({ onLogout }: SettingsAboutSectionProps) {
    const { t } = useTranslation();
    const feedbackSubject = t('settings.about.feedback_subject', {
        brandName: BRAND_NAME,
        defaultValue: 'Feedback - {{brandName}}'
    });

    return (
        <div className="settings-about-v25 mb-6">
            <section className="settings-about-surface" aria-labelledby="settings-about-title">
                <header className="settings-about-header">
                    <div>
                        <p className="app-kicker mb-2">{t('settings.control_sections.about', { defaultValue: 'About' })}</p>
                        <h2 id="settings-about-title" className="text-xl font-semibold text-[var(--hi-text)]">
                            {t('settings.about.title')}
                        </h2>
                    </div>
                    <dl className="settings-about-identity" aria-label={t('settings.about.title')}>
                        <div>
                            <dt>{t('settings.about.version')}</dt>
                            <dd>{APP_VERSION}</dd>
                        </div>
                        <div>
                            <dt>{t('settings.about.brand')}</dt>
                            <dd>{BRAND_NAME}</dd>
                        </div>
                    </dl>
                </header>

                <div className="settings-about-content">
                    <div className="settings-about-row">
                        <span className="settings-about-icon" aria-hidden="true">
                            <HelpCircle className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[var(--hi-text)]">{t('common.help_support')}</p>
                            <p className="mt-1 text-sm leading-6 text-[var(--hi-text-soft)] [overflow-wrap:anywhere]">
                                {SUPPORT_CONTACT_LABEL}
                            </p>
                        </div>
                        <a
                            href={SUPPORT_CONTACT_URL.startsWith('mailto:')
                                ? `${SUPPORT_CONTACT_URL}?subject=${encodeURIComponent(feedbackSubject)}`
                                : SUPPORT_CONTACT_URL}
                            target={SUPPORT_CONTACT_URL.startsWith('http') ? '_blank' : undefined}
                            rel={SUPPORT_CONTACT_URL.startsWith('http') ? 'noreferrer' : undefined}
                            className="btn-secondary settings-about-action"
                        >
                            {t('settings.about.feedback')}
                        </a>
                    </div>

                    <div className="settings-about-row settings-about-legal">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[var(--hi-text)]">{t('settings.about.legal_title')}</p>
                            <p className="mt-1 text-sm leading-6 text-[var(--hi-text-soft)]">{t('settings.about.legal_description')}</p>
                        </div>
                        <nav className="settings-about-links" aria-label={t('settings.about.legal_title')}>
                            <Link to="/terms-of-service">{t('settings.about.terms_link')}</Link>
                            <Link to="/privacy-policy">{t('settings.about.privacy_link')}</Link>
                        </nav>
                    </div>

                    <aside className="settings-about-beta">
                        <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <div>
                            <p className="text-sm font-semibold text-[var(--hi-text)]">
                                {t('settings.about.beta_title', { defaultValue: 'Beta status' })}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-[var(--hi-text-soft)]">
                                {t('settings.about.beta_body', {
                                    brandName: BRAND_NAME,
                                    defaultValue: `${BRAND_NAME} is still in beta. Features can change, workflows may evolve, and important household data should always be backed up.`
                                })}
                            </p>
                        </div>
                    </aside>
                </div>

                <footer className="settings-about-footer">
                    <span className="text-sm font-semibold text-[var(--hi-text-soft)]">{t('common.logout')}</span>
                    <button
                        type="button"
                        onClick={onLogout}
                        aria-label={t('common.logout')}
                        className="settings-about-logout"
                    >
                        <LogOut className="h-5 w-5" aria-hidden="true" />
                        {t('common.logout')}
                    </button>
                </footer>
            </section>
        </div>
    );
}
