import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { APP_VERSION, BRAND_NAME, SUPPORT_EMAIL } from '../constants/branding';

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
        <>
            <div className="app-control-section mb-6">
                <p className="app-kicker mb-3">{t('settings.control_sections.about', { defaultValue: 'About' })}</p>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--hi-text)]">
                    {t('settings.about.title')}
                </h2>
                <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-[var(--hi-border)] py-3">
                        <span className="text-[var(--hi-text-soft)]">{t('settings.about.version')}</span>
                        <span className="font-medium text-[var(--hi-text)]">{APP_VERSION}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-[var(--hi-border)] py-3">
                        <span className="text-[var(--hi-text-soft)]">{t('settings.about.brand')}</span>
                        <span className="font-medium text-[var(--hi-text)]">{BRAND_NAME}</span>
                    </div>
                    <div className="pt-2">
                        <a
                            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(feedbackSubject)}`}
                            className="btn-secondary flex w-full items-center justify-center gap-2 py-3"
                        >
                            {t('settings.about.feedback')}
                        </a>
                        <p className="mt-2 text-center text-xs text-[var(--hi-text-soft)]">
                            {SUPPORT_EMAIL}
                        </p>
                    </div>
                    <div className="rounded-xl border border-[var(--hi-border)] bg-[var(--hi-panel-muted)] p-4">
                        <div className="mb-3">
                            <p className="text-sm font-semibold text-[var(--hi-text)]">
                                {t('settings.about.legal_title')}
                            </p>
                            <p className="mt-1 text-xs text-[var(--hi-text-soft)]">
                                {t('settings.about.legal_description')}
                            </p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <Link to="/terms-of-service" className="btn-secondary py-3 text-center">
                                {t('settings.about.terms_link')}
                            </Link>
                            <Link to="/privacy-policy" className="btn-secondary py-3 text-center">
                                {t('settings.about.privacy_link')}
                            </Link>
                        </div>
                    </div>
                    <div className="rounded-xl border border-[rgba(184,153,104,0.24)] bg-[var(--hi-secondary-soft)] p-4">
                        <p className="text-sm font-semibold text-[var(--hi-text)]">
                            {t('settings.about.beta_title', { defaultValue: 'Beta status' })}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--hi-text-soft)]">
                            {t('settings.about.beta_body', {
                                brandName: BRAND_NAME,
                                defaultValue: `${BRAND_NAME} is still in beta. Features can change, workflows may evolve, and important household data should always be backed up.`
                            })}
                        </p>
                    </div>
                </div>
            </div>

            <div className="app-control-section mb-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--hi-text-soft)]">
                            {t('common.logout')}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onLogout}
                        aria-label={t('common.logout')}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/18 bg-red-500/6 px-5 py-3 font-medium text-red-400 transition hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hi-panel-strong)]"
                    >
                        <LogOut className="h-5 w-5" />
                        {t('common.logout')}
                    </button>
                </div>
            </div>
        </>
    );
}
