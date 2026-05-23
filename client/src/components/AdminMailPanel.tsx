import { useState, ChangeEvent, FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Mail, Send, AlertCircle, CheckCircle, Loader2, Shield } from 'lucide-react';
import { SUPPORT_EMAIL } from '../constants/branding';

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

                // Reset remaining emails after 1 minute
                setTimeout(() => setRemainingEmails(3), 60000);
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
                setTimeout(() => setRemainingEmails(3), 60000);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg">
                    <Mail size={24} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
                        {t('admin.email.title', { defaultValue: 'Send Email' })}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">
                        {t('admin.email.compose_body', {
                            defaultValue: 'Compose a single outbound email with safe HTML formatting and platform branding.'
                        })}
                    </p>
                </div>
            </div>

            {/* Security Info */}
            <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 flex items-start gap-3">
                <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                    <p className="font-medium text-indigo-800 dark:text-indigo-300">
                        {t('admin.email.security_title', { defaultValue: 'Secure sending' })}
                    </p>
                    <p className="text-indigo-600 dark:text-indigo-400 mt-1">
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
                <div className={`rounded-xl p-4 flex items-center gap-3 ${status.type === 'success'
                        ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800'
                        : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800'
                    }`}>
                    {status.type === 'success' ? (
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : (
                        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    )}
                    <p className={status.type === 'success'
                        ? 'text-green-800 dark:text-green-300'
                        : 'text-red-800 dark:text-red-300'
                    }>
                        {status.message}
                    </p>
                </div>
            )}

            {/* Email Form */}
            <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="p-6 space-y-5">
                    {/* To Field */}
                    <div>
                        <label htmlFor="to" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
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
                            className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        />
                    </div>

                    {/* Subject Field */}
                    <div>
                        <label htmlFor="subject" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
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
                            className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        />
                        <p className="text-xs text-slate-400 mt-1">{formData.subject.length}/200</p>
                    </div>

                    {/* Message Field */}
                    <div>
                        <label htmlFor="message" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
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
                            className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                        />
                        <p className="text-xs text-slate-400 mt-1">
                            {t('admin.email.format_hint', {
                                defaultValue: 'HTML is supported. For example: <b>bold</b>, <i>italic</i>, <a href="...">link</a>'
                            })}
                        </p>
                    </div>
                </div>

                {/* Submit Button */}
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700">
                    <button
                        type="submit"
                        disabled={loading || remainingEmails === 0}
                        className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:from-slate-400 disabled:to-slate-500 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2"
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
                        <p className="text-sm text-amber-600 dark:text-amber-400 mt-3">
                            {t('admin.email.rate_limit_reached', { defaultValue: '⏳ Rate limit reached. Please wait 1 minute.' })}
                        </p>
                    )}
                </div>
            </form>

            {/* Info Card */}
            <div className="bg-slate-100 dark:bg-slate-800/50 rounded-xl p-4 text-sm text-slate-600 dark:text-slate-400">
                <p className="font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {t('admin.email.info_title', { defaultValue: 'Information' })}
                </p>
                <ul className="space-y-1 list-disc list-inside">
                    <li>{t('admin.email.info_bullet_1', { supportEmail: SUPPORT_EMAIL, defaultValue: 'Emails are sent from {{supportEmail}}' })}</li>
                    <li>{t('admin.email.info_bullet_2', { defaultValue: 'You can send at most 3 emails per minute to prevent spam' })}</li>
                    <li>{t('admin.email.info_bullet_3', { defaultValue: 'All sends are logged for security, excluding content' })}</li>
                </ul>
            </div>
        </div>
    );
};

export default AdminMailPanel;
