import * as React from 'react';
import { Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LegalDocumentPage from './LegalDocumentPage';
import {
    BRAND_HOST,
    BRAND_NAME,
    DATA_CONTROLLER_ADDRESS,
    DATA_CONTROLLER_NAME,
    DPO_EMAIL,
    PRIVACY_COMPLAINT_AUTHORITY,
    PRIVACY_TRANSFER_DISCLOSURE,
    SUPPORT_EMAIL
} from '../constants/branding';
import { resolveVerifiedLegalTranslationLanguage } from '../utils/legalTranslations';

const PRIVACY_PAGE_KEYS = [
    'legal.document_badge',
    'legal.data_privacy_badge',
    'legal.back_to_home',
    'legal.quick_access',
    'legal.on_this_page',
    'legal.contents',
    'legal.page_label',
    'legal.overview',
    'legal.contact',
    'legal.jump_to',
    'legal.privacy_policy_title',
    'legal.privacy_policy_content',
    'legal.privacy_description',
    'legal.privacy_support_label',
    'legal.controller_name_generic',
    'legal.controller_name_public_host',
    'legal.controller_address_unconfigured',
    'legal.transfer_disclosure_default',
    'legal.complaint_authority',
    'legal.privacy_summary.title',
    'legal.privacy_summary.description',
    'legal.privacy_summary.items.what',
    'legal.privacy_summary.items.why',
    'legal.privacy_summary.items.sharing',
    'legal.privacy_summary.items.control',
    'legal.privacy_summary.shortcuts.what',
    'legal.privacy_summary.shortcuts.why',
    'legal.privacy_summary.shortcuts.sharing',
    'legal.privacy_summary.shortcuts.rights',
    'legal.privacy_summary.section_titles.what',
    'legal.privacy_summary.section_titles.why',
    'legal.privacy_summary.section_titles.sharing',
    'legal.privacy_summary.section_titles.rights'
];

export default function PrivacyPolicy() {
    const { i18n } = useTranslation();
    const documentLanguage = resolveVerifiedLegalTranslationLanguage(i18n, PRIVACY_PAGE_KEYS);
    const pageT = i18n.getFixedT(documentLanguage);
    const hasPublicHost = BRAND_HOST && !/(^|\.)localhost$/.test(BRAND_HOST);
    const controllerName = DATA_CONTROLLER_NAME || (
        pageT(
            hasPublicHost
                ? 'legal.controller_name_public_host'
                : 'legal.controller_name_generic',
            { brandHost: BRAND_HOST }
        )
    );
    const controllerAddress = DATA_CONTROLLER_ADDRESS || (
        pageT('legal.controller_address_unconfigured')
    );
    const privacyEmail = DPO_EMAIL || SUPPORT_EMAIL;
    const transferDisclosure = PRIVACY_TRANSFER_DISCLOSURE || (
        pageT('legal.transfer_disclosure_default')
    );
    const complaintAuthority = PRIVACY_COMPLAINT_AUTHORITY || (
        pageT('legal.complaint_authority')
    );

    const summaryBlock = {
        title: pageT('legal.privacy_summary.title'),
        description: pageT('legal.privacy_summary.description'),
        items: [
            pageT('legal.privacy_summary.items.what'),
            pageT('legal.privacy_summary.items.why'),
            pageT('legal.privacy_summary.items.sharing'),
            pageT('legal.privacy_summary.items.control')
        ],
        shortcuts: [
            {
                title: pageT('legal.privacy_summary.section_titles.what'),
                label: pageT('legal.privacy_summary.shortcuts.what')
            },
            {
                title: pageT('legal.privacy_summary.section_titles.why'),
                label: pageT('legal.privacy_summary.shortcuts.why')
            },
            {
                title: pageT('legal.privacy_summary.section_titles.sharing'),
                label: pageT('legal.privacy_summary.shortcuts.sharing')
            },
            {
                title: pageT('legal.privacy_summary.section_titles.rights'),
                label: pageT('legal.privacy_summary.shortcuts.rights')
            }
        ]
    };

    return (
        <LegalDocumentPage
            translationLanguage={documentLanguage}
            icon={Shield}
            eyebrowLabel={pageT('legal.data_privacy_badge')}
            title={pageT('legal.privacy_policy_title')}
            description={pageT('legal.privacy_description', {
                brandName: BRAND_NAME
            })}
            content={pageT('legal.privacy_policy_content', {
                brandName: BRAND_NAME,
                controllerName,
                controllerAddress,
                privacyEmail,
                transferDisclosure,
                complaintAuthority,
                supportEmail: SUPPORT_EMAIL
            })}
            summaryBlock={summaryBlock}
            supportLabel={pageT('legal.privacy_support_label')}
            supportValue={privacyEmail}
            backLabel={pageT('legal.back_to_home')}
        />
    );
}
