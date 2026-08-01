import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { isAllowedIdenticalTranslation } from '../scripts/i18n-helpers.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientLocalesDir = path.join(rootDir, 'client', 'public', 'locales');
const serverLocalesDir = path.join(rootDir, 'locales');
const artifactPattern =
    /HI_(?:KEY|MISSING|VAULT)_SEP|HIPLACEHOLDER|INVALID TARGET LANGUAGE|LANGPAIR=|<<<|>>>|⟦|⟧/iu;
const additionalKeyPaths = [
    'auth.account_locked',
    'navigation.boxes',
    'navigation.organization',
    'items.form.box',
    'items.form.no_box',
    'items.form.box_help',
    'items.form.box_location_title',
    'settings.data_management.backup_modal_body',
    'settings.data_management.import_summary_body',
    'settings.data_management.preview_boxes',
    'settings.data_management.skipped_boxes',
    'inventory.all_boxes',
    'inventory.box_filter_label',
    'inventory.bulk.keep_box',
    'inventory.bulk.placement_follows_box',
    'inventory.bulk.room_follows_box',
    'inventory.bulk.location_follows_box',
    'rate_limit.too_many_requests',
    'activity.box',
    'activity.box_with_id',
    'activity.actions.item_box_moved',
    'activity.actions.box_created',
    'activity.actions.box_updated',
    'activity.actions.box_archived',
    'activity.actions.box_restored',
    'activity.actions.box_deleted'
];

function readJson(filePath) {
    return JSON.parse(readFileSync(filePath, 'utf8'));
}

function getDeepValue(value, keyPath) {
    return keyPath.split('.').reduce((current, key) => current?.[key], value);
}

function collectStringKeyPaths(value, prefix) {
    const keyPaths = [];
    for (const [key, child] of Object.entries(value || {})) {
        const keyPath = `${prefix}.${key}`;
        if (child && typeof child === 'object' && !Array.isArray(child)) {
            keyPaths.push(...collectStringKeyPaths(child, keyPath));
        } else if (typeof child === 'string') {
            keyPaths.push(keyPath);
        }
    }
    return keyPaths;
}

function placeholders(value) {
    return [...String(value || '').matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)]
        .map((match) => match[1].trim())
        .sort();
}

test('v2.6 box and organization strings are genuinely localized in all 103 locales', () => {
    const english = readJson(path.join(clientLocalesDir, 'en', 'translation.json'));
    const keyPaths = [
        ...additionalKeyPaths,
        ...collectStringKeyPaths(english.boxes, 'boxes'),
        ...collectStringKeyPaths(english.box_labels, 'box_labels')
    ];
    const languages = readdirSync(clientLocalesDir)
        .filter((language) =>
            existsSync(path.join(clientLocalesDir, language, 'translation.json'))
        )
        .sort();

    assert.equal(languages.length, 103);
    assert.equal(keyPaths.length, 169);

    for (const language of languages) {
        const locale = readJson(
            path.join(clientLocalesDir, language, 'translation.json')
        );
        for (const keyPath of keyPaths) {
            const source = getDeepValue(english, keyPath);
            const translated = getDeepValue(locale, keyPath);

            assert.equal(
                typeof translated,
                'string',
                `${language}/${keyPath} must be a string`
            );
            assert.ok(translated.trim(), `${language}/${keyPath} must not be blank`);
            assert.deepEqual(
                placeholders(translated),
                placeholders(source),
                `${language}/${keyPath} must preserve interpolation placeholders`
            );
            assert.doesNotMatch(
                translated,
                artifactPattern,
                `${language}/${keyPath} contains a translation artifact`
            );

            if (!['en', 'tr'].includes(language)) {
                assert.ok(
                    translated !== source ||
                        isAllowedIdenticalTranslation(keyPath, language),
                    `${language}/${keyPath} is still an unreviewed English fallback`
                );
            }
        }
    }
});

test('server login lock and rate-limit messages match the client locales', () => {
    const languages = readdirSync(clientLocalesDir)
        .filter((language) =>
            existsSync(path.join(clientLocalesDir, language, 'translation.json'))
        )
        .sort();
    const keyPaths = [
        'auth.account_locked',
        'rate_limit.too_many_requests'
    ];

    for (const language of languages) {
        const clientLocale = readJson(
            path.join(clientLocalesDir, language, 'translation.json')
        );
        const serverLocale = readJson(path.join(serverLocalesDir, `${language}.json`));
        for (const keyPath of keyPaths) {
            assert.equal(
                getDeepValue(serverLocale, keyPath),
                getDeepValue(clientLocale, keyPath),
                `${language}/${keyPath} must stay synchronized`
            );
        }
    }
});
