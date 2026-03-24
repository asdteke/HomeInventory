export const BRAND_NAME = String(process.env.APP_BRAND_NAME || 'Envanterim').trim() || 'Envanterim';
export const SUPPORT_EMAIL = String(process.env.SUPPORT_EMAIL || 'support@envanterim.net.tr').trim() || 'support@envanterim.net.tr';
export const DEFAULT_FROM = String(process.env.EMAIL_FROM || `${BRAND_NAME} <${SUPPORT_EMAIL}>`).trim();
