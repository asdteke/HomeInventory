import { useEffect, useRef, useState, ChangeEvent, FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Mail, Send, AlertCircle, CheckCircle, Loader2, Shield } from 'lucide-react';
import { SUPPORT_EMAIL } from '../constants/branding';
import '../admin-overlays-v25.css';

interface FormDataState {
    to: string;
    subject: string;
    message: string;
}

interface StatusState {
    type: 'success' | 'error' | null;
    message: string;
}

const AdminMailPanel = () => {
    const { isAdmin, user } = useAuth();
    const { t } = useTranslation();
    const [formData, setFormData] = useState<FormDataState>({
        to: '',
        subject: '',
        message: ''
    });
    const [status, setStatus] = useState<StatusState>({ type: null, message: '' });
    const [loading, setLoading] = useState<boolean>(false);
    const [remainingEmails, setRemainingEmails] = useState<number>(3);
    const rateResetTimerRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (rateResetTimerRef.current !== null) {
            window.clearTimeout(rateResetTimerRef.current);
        }
    }, []);

    const scheduleRateLimitReset = () => {
        if (rateResetTimerRef.current !== null) {
            window.clearTimeout(rateResetTimerRef.current);
        }
        rateResetTimerRef.current = window.setTimeout(() => {
            setRemainingEmails(3);
            rateResetTimerRef.current = null;
        }, 60000);
    };

    // Redirect non-admin users
    if (!isAdmin) {
        return <Navigate to="/" replace />;
    }

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setStatus({ type: null, message: '' });

        try {
            const response = await axios.post('/api/admin/email/send', formData);

            if (response.data.success) {
                setStatus({
                    type: 'success',
                    message: t('admin.email.send_success_with_id', {
                        emailId: response.data.emailId || 'N/A',
                        defaultValue: '✅ Email sent successfully! ID: {{emailId}}'
                    })
                });
                setFormData({ to: '', subject: '', message: '' });
                setRemainingEmails(prev => Math.max(0, prev - 1));

                scheduleRateLimitReset();
            }
        } catch (error: any) {
            const errorMsg = error.response?.data?.error || t('admin.email.send_error', { defaultValue: 'Email could not be sent' });
            setStatus({
                type: 'error',
                message: errorMsg
            });

            // Rate limit error
            if (error.response?.status === 429) {
                setRemainingEmails(0);
                scheduleRateLimitReset();
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="admin-mail-v25 space-y-5">
            <header className="admin-mail-v25-header flex items-center gap-4">
                <div className="admin-mail-v25-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.1rem] text-white">
                    <Mail size={24} />
                </div>
                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-[-0.035em] text-[var(--hi-text)]">
                        {t('admin.email.title', { defaultValue: 'Send Email' })}
                    </h1>
                    <p className="mt-1 text-sm leading-6 text-[var(--hi-text-soft)]">
                        {t('admin.email.compose_body', {
                            defaultValue: 'Compose a single outbound email with safe HTML formatting and platform branding.'
                        })}
                    </p>
                </div>
            </header>

            <div className="admin-mail-v25-security flex items-start gap-3 rounded-[1.25rem] p-4">
                <Shield className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--hi-accent)]" />
                <div className="text-sm">
                    <p className="font-semibold text-[var(--hi-text)]">
                        {t('admin.email.security_title', { defaultValue: 'Secure sending' })}
                    </p>
                    <p className="mt-1 leading-6 text-[var(--hi-text-soft)]">
                        {t('admin.email.security_body', {
                            username: user?.username || 'Admin',
                            remaining: remainingEmails,
                            defaultValue: 'Admin: {{username}} • Limit: {{remaining}}/3 emails per minute'
                        })}
                    </p>
                </div>
            </div>

            {/* Status Message */}
            {status.type && (
                <div role="status" className={`admin-mail-v25-status admin-mail-v25-status-${status.type} flex items-center gap-3 rounded-[1.25rem] p-4`}>
                    {status.type === 'success' ? (
                        <CheckCircle className="h-5 w-5 shrink-0" />
                    ) : (
                        <AlertCircle className="h-5 w-5 shrink-0" />
                    )}
                    <p className="min-w-0 break-words text-sm font-medium">
                        {status.message}
                    </p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="admin-mail-v25-form overflow-hidden rounded-[1.75rem]">
                <div className="p-6 space-y-5">
                    <div>
                        <label htmlFor="to" className="mb-2 block text-sm font-semibold text-[var(--hi-text)]">
                            {t('admin.email.to', { defaultValue: 'Recipient (To)' })} *
                        </label>
                        <input
                            type="email"
                            id="to"
                            name="to"
                            value={formData.to}
                            onChange={handleChange}
                            placeholder={t('admin.email.placeholder_to', { defaultValue: 'name@example.com' })}
                            required
                            className="admin-mail-v25-field input-field w-full"
                        />
                    </div>

                    <div>
                        <label htmlFor="subject" className="mb-2 block text-sm font-semibold text-[var(--hi-text)]">
                            {t('admin.email.subject', { defaultValue: 'Subject' })} *
                        </label>
                        <input
                            type="text"
                            id="subject"
                            name="subject"
                            value={formData.subject}
                            onChange={handleChange}
                            placeholder={t('admin.email.placeholder_subject', { defaultValue: 'Message subject' })}
                            maxLength={200}
                            required
                            className="admin-mail-v25-field input-field w-full"
                        />
                        <p className="mt-1 text-right text-xs tabular-nums text-[var(--hi-text-muted)]">{formData.subject.length}/200</p>
                    </div>

                    <div>
                        <label htmlFor="message" className="mb-2 block text-sm font-semibold text-[var(--hi-text)]">
                            {t('admin.email.message', { defaultValue: 'Message' })} *
                        </label>
                        <textarea
                            id="message"
                            name="message"
                            value={formData.message}
                            onChange={handleChange}
                            placeholder={t('admin.email.placeholder_message', { defaultValue: 'Write your message here...' })}
                            rows={8}
                            required
                            className="admin-mail-v25-field input-field w-full resize-y"
                        />
                        <p className="mt-2 text-xs leading-5 text-[var(--hi-text-muted)]">
                            {t('admin.email.format_hint', {
                                defaultValue: 'HTML is supported. For example: <b>bold</b>, <i>italic</i>, <a href="...">link</a>'
                            })}
                        </p>
                    </div>
                </div>

                <div className="admin-mail-v25-actions px-6 py-4">
                    <button
                        type="submit"
                        disabled={loading || remainingEmails === 0}
                        className="btn-primary flex w-full items-center justify-center gap-2 px-8 py-3 sm:w-auto"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                {t('admin.email.sending', { defaultValue: 'Sending...' })}
                            </>
                        ) : (
                            <>
                                <Send className="w-5 h-5" />
                                {t('admin.email.send', { defaultValue: 'Send' })}
                            </>
                        )}
                    </button>

                    {remainingEmails === 0 && (
                        <p className="mt-3 text-sm text-[var(--hi-warning)]">
                            {t('admin.email.rate_limit_reached', { defaultValue: '⏳ Rate limit reached. Please wait 1 minute.' })}
                        </p>
                    )}
                </div>
            </form>

            <aside className="admin-mail-v25-info rounded-[1.25rem] p-4 text-sm leading-6 text-[var(--hi-text-soft)]">
                <p className="mb-2 font-semibold text-[var(--hi-text)]">
                    {t('admin.email.info_title', { defaultValue: 'Information' })}
                </p>
                <ul className="list-inside list-disc space-y-1">
                    <li>{t('admin.email.info_bullet_1', { supportEmail: SUPPORT_EMAIL, defaultValue: 'Emails are sent from {{supportEmail}}' })}</li>
                    <li>{t('admin.email.info_bullet_2', { defaultValue: 'You can send at most 3 emails per minute to prevent spam' })}</li>
                    <li>{t('admin.email.info_bullet_3', { defaultValue: 'All sends are logged for security, excluding content' })}</li>
                </ul>
            </aside>
        </div>
    );
};

export default AdminMailPanel;
