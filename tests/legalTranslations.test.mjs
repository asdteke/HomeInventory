import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCompleteTranslationLanguage, resolveVerifiedLegalTranslationLanguage } from '../client/src/utils/legalTranslations.js';

function createI18nStub(availableKeysByLanguage, resourcesByLanguage = {}) {
    return {
        resolvedLanguage: 'en',
        exists(key, { lng }) {
            return Boolean(availableKeysByLanguage[lng]?.has(key));
        },
        getResource(lng, namespace, key) {
            return resourcesByLanguage[lng]?.[key];
        }
    };
}

test('resolveCompleteTranslationLanguage keeps the active language when all keys exist', () => {
    const requiredKeys = ['legal.privacy_policy_title', 'legal.terms_of_service_title'];
    const i18n = createI18nStub({
        en: new Set(requiredKeys),
        de: new Set(requiredKeys)
    });
    i18n.resolvedLanguage = 'de';

    assert.equal(resolveCompleteTranslationLanguage(i18n, requiredKeys), 'de');
});

test('resolveVerifiedLegalTranslationLanguage falls back to English for unverified legal locales', () => {
    const requiredKeys = [
        'legal.privacy_policy_title',
        'legal.privacy_policy_content',
        'legal.terms_of_service_title',
        'legal.terms_of_service_content'
    ];
    const i18n = createI18nStub(
        {
            en: new Set(requiredKeys),
            de: new Set(requiredKeys)
        },
        {
            en: {
                'legal.privacy_policy_content': '## Overview\n## Collection\n## Purpose\n## Storage\n## Rights\n'.repeat(40),
                'legal.terms_of_service_content': '1. Overview\n2. Use\n3. Security\n4. Lifecycle\n5. Disclaimer\n'.repeat(20)
            },
            de: {
                'legal.privacy_policy_content': 'Kurzer Datenschutztext',
                'legal.terms_of_service_content': 'Kurzer Nutzungsbedingungentext'
            }
        }
    );
    i18n.resolvedLanguage = 'de';

    assert.equal(resolveVerifiedLegalTranslationLanguage(i18n, requiredKeys), 'en');
});

test('resolveVerifiedLegalTranslationLanguage keeps Turkish when it is verified', () => {
    const requiredKeys = ['legal.privacy_policy_title', 'legal.terms_of_service_title'];
    const i18n = createI18nStub({
        en: new Set(requiredKeys),
        tr: new Set(requiredKeys)
    });
    i18n.resolvedLanguage = 'tr';

    assert.equal(resolveVerifiedLegalTranslationLanguage(i18n, requiredKeys), 'tr');
});

test('resolveVerifiedLegalTranslationLanguage rejects incomplete long-form legal translations', () => {
    const requiredKeys = [
        'legal.privacy_policy_title',
        'legal.privacy_policy_content',
        'legal.terms_of_service_title',
        'legal.terms_of_service_content'
    ];
    const i18n = createI18nStub(
        {
            en: new Set(requiredKeys),
            fr: new Set(requiredKeys)
        },
        {
            en: {
                'legal.privacy_policy_content': '## Overview\n## Collection\n## Purpose\n## Storage\n## Rights\n'.repeat(40),
                'legal.terms_of_service_content': '1. Overview\n2. Use\n3. Security\n4. Lifecycle\n5. Disclaimer\n'.repeat(20)
            },
            fr: {
                'legal.privacy_policy_content': 'Court texte de confidentialité',
                'legal.terms_of_service_content': 'Conditions courtes'
            }
        }
    );
    i18n.resolvedLanguage = 'fr';

    assert.equal(resolveVerifiedLegalTranslationLanguage(i18n, requiredKeys), 'en');
});
