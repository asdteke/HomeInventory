import * as React from 'react';
import { FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LegalDocumentPage from './LegalDocumentPage';
import { BRAND_NAME, SUPPORT_EMAIL } from '../constants/branding';
import { resolveVerifiedLegalTranslationLanguage } from '../utils/legalTranslations';

const TERMS_PAGE_KEYS = [
    'legal.document_badge',
    'legal.back_to_home',
    'legal.quick_access',
    'legal.on_this_page',
    'legal.contents',
    'legal.page_label',
    'legal.overview',
    'legal.contact',
    'legal.jump_to',
    'legal.terms_of_service_title',
    'legal.terms_of_service_content',
    'legal.terms_description',
    'legal.terms_support_label',
    'legal.terms_summary.eyebrow',
    'legal.terms_summary.title',
    'legal.terms_summary.items.use',
    'legal.terms_summary.items.responsibility',
    'legal.terms_summary.items.security',
    'legal.terms_summary.items.backups',
    'legal.terms_summary.items.disclaimer'
];

export default function TermsOfService() {
    const { i18n } = useTranslation();
    const documentLanguage = resolveVerifiedLegalTranslationLanguage(i18n, TERMS_PAGE_KEYS);
    const pageT = i18n.getFixedT(documentLanguage);

    const summaryBlock = {
        eyebrow: pageT('legal.terms_summary.eyebrow'),
        title: pageT('legal.terms_summary.title'),
        items: [
            pageT('legal.terms_summary.items.use'),
            pageT('legal.terms_summary.items.responsibility'),
            pageT('legal.terms_summary.items.security'),
            pageT('legal.terms_summary.items.backups'),
            pageT('legal.terms_summary.items.disclaimer')
        ]
    };

    return (
        <LegalDocumentPage
            translationLanguage={documentLanguage}
            icon={FileText}
            title={pageT('legal.terms_of_service_title')}
            eyebrowLabel={pageT('legal.document_badge')}
            description={pageT('legal.terms_description', {
                brandName: BRAND_NAME
            })}
            content={pageT('legal.terms_of_service_content', {
                brandName: BRAND_NAME,
                supportEmail: SUPPORT_EMAIL
            })}
            summaryBlock={summaryBlock}
            supportLabel={pageT('legal.terms_support_label')}
            supportValue={SUPPORT_EMAIL}
            backLabel={pageT('legal.back_to_home')}
        />
    );
}
