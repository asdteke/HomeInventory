import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const lockfile = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const clientLockfile = JSON.parse(readFileSync(new URL('../client/package-lock.json', import.meta.url), 'utf8'));
const launcherLockfile = JSON.parse(readFileSync(new URL('../apps/launcher/package-lock.json', import.meta.url), 'utf8'));

function numericVersion(version) {
    return String(version || '').split('.').map((part) => Number.parseInt(part, 10) || 0);
}

function isAtLeast(actual, minimum) {
    const actualParts = numericVersion(actual);
    const minimumParts = numericVersion(minimum);
    const length = Math.max(actualParts.length, minimumParts.length);

    for (let index = 0; index < length; index += 1) {
        const actualPart = actualParts[index] || 0;
        const minimumPart = minimumParts[index] || 0;
        if (actualPart !== minimumPart) {
            return actualPart > minimumPart;
        }
    }

    return true;
}

test('security-sensitive dependencies stay above patched versions', () => {
    const multerVersion = lockfile.packages?.['node_modules/multer']?.version;
    const undiciVersion = lockfile.packages?.['node_modules/undici']?.version;
    const bodyParserVersion = lockfile.packages?.['node_modules/body-parser']?.version;
    const shellQuoteVersion = lockfile.packages?.['node_modules/shell-quote']?.version;
    const axiosVersion = lockfile.packages?.['node_modules/axios']?.version;
    const clientAxiosVersion = clientLockfile.packages?.['node_modules/axios']?.version;
    const followRedirectsVersion = lockfile.packages?.['node_modules/follow-redirects']?.version;
    const clientFollowRedirectsVersion = clientLockfile.packages?.['node_modules/follow-redirects']?.version;
    const formDataVersion = lockfile.packages?.['node_modules/form-data']?.version;
    const clientFormDataVersion = clientLockfile.packages?.['node_modules/form-data']?.version;
    const i18nextHttpMiddlewareVersion = lockfile.packages?.['node_modules/i18next-http-middleware']?.version;
    const i18nextFsBackendVersion = lockfile.packages?.['node_modules/i18next-fs-backend']?.version;
    const sharpVersion = lockfile.packages?.['node_modules/sharp']?.version;
    const clientPostcssVersion = clientLockfile.packages?.['node_modules/postcss']?.version;
    const launcherPostcssVersion = launcherLockfile.packages?.['node_modules/postcss']?.version;
    const reactRouterVersion = clientLockfile.packages?.['node_modules/react-router']?.version;
    const reactRouterDomVersion = clientLockfile.packages?.['node_modules/react-router-dom']?.version;

    assert.ok(isAtLeast(multerVersion, '2.2.0'), `multer ${multerVersion} is below patched 2.2.0`);
    assert.ok(isAtLeast(undiciVersion, '7.28.0'), `undici ${undiciVersion} is below patched 7.28.0`);
    assert.ok(isAtLeast(bodyParserVersion, '1.20.6'), `body-parser ${bodyParserVersion} is below patched 1.20.6`);
    assert.ok(isAtLeast(shellQuoteVersion, '1.10.0'), `shell-quote ${shellQuoteVersion} is below patched 1.10.0`);
    assert.ok(isAtLeast(axiosVersion, '1.18.1'), `root axios ${axiosVersion} is below patched 1.18.1`);
    assert.ok(isAtLeast(clientAxiosVersion, '1.18.1'), `client axios ${clientAxiosVersion} is below patched 1.18.1`);
    assert.ok(isAtLeast(followRedirectsVersion, '1.16.0'), `root follow-redirects ${followRedirectsVersion} is below patched 1.16.0`);
    assert.ok(isAtLeast(clientFollowRedirectsVersion, '1.16.0'), `client follow-redirects ${clientFollowRedirectsVersion} is below patched 1.16.0`);
    assert.ok(isAtLeast(formDataVersion, '4.0.6'), `root form-data ${formDataVersion} is below patched 4.0.6`);
    assert.ok(isAtLeast(clientFormDataVersion, '4.0.6'), `client form-data ${clientFormDataVersion} is below patched 4.0.6`);
    assert.ok(
        isAtLeast(i18nextHttpMiddlewareVersion, '3.9.7'),
        `i18next-http-middleware ${i18nextHttpMiddlewareVersion} is below patched 3.9.7`
    );
    assert.ok(isAtLeast(sharpVersion, '0.35.3'), `sharp ${sharpVersion} is below patched 0.35.3`);
    assert.ok(isAtLeast(clientPostcssVersion, '8.5.18'), `client postcss ${clientPostcssVersion} is below patched 8.5.18`);
    assert.ok(isAtLeast(launcherPostcssVersion, '8.5.18'), `launcher postcss ${launcherPostcssVersion} is below patched 8.5.18`);
    assert.ok(isAtLeast(reactRouterVersion, '7.18.0'), `react-router ${reactRouterVersion} is below patched 7.18.0`);
    assert.ok(isAtLeast(reactRouterDomVersion, '7.18.0'), `react-router-dom ${reactRouterDomVersion} is below patched 7.18.0`);
    assert.equal(i18nextFsBackendVersion, undefined, 'i18next-fs-backend should not be reintroduced');
});
