import test from 'node:test';
import assert from 'node:assert/strict';
import { collectPrecacheBundleUrls, createServiceWorker } from '../client/vite.config.js';

test('PWA precache keeps the app shell but excludes lazy route and feature chunks', () => {
    const urls = collectPrecacheBundleUrls({
        'assets/index-main.js': {
            type: 'chunk',
            fileName: 'assets/index-main.js',
            isEntry: true,
            imports: ['assets/vendor-react.js', 'assets/vendor-data.js'],
            dynamicImports: ['assets/ItemForm.js', 'assets/Settings.js', 'assets/vendor-scanner.js']
        },
        'assets/vendor-react.js': {
            type: 'chunk',
            fileName: 'assets/vendor-react.js',
            imports: [],
            dynamicImports: []
        },
        'assets/vendor-data.js': {
            type: 'chunk',
            fileName: 'assets/vendor-data.js',
            imports: ['assets/runtime.js'],
            dynamicImports: []
        },
        'assets/runtime.js': {
            type: 'chunk',
            fileName: 'assets/runtime.js',
            imports: [],
            dynamicImports: []
        },
        'assets/ItemForm.js': {
            type: 'chunk',
            fileName: 'assets/ItemForm.js',
            imports: ['assets/vendor-ui.js'],
            dynamicImports: []
        },
        'assets/Settings.js': {
            type: 'chunk',
            fileName: 'assets/Settings.js',
            imports: ['assets/vendor-ui.js'],
            dynamicImports: []
        },
        'assets/vendor-scanner.js': {
            type: 'chunk',
            fileName: 'assets/vendor-scanner.js',
            imports: [],
            dynamicImports: []
        },
        'assets/index.css': {
            type: 'asset',
            fileName: 'assets/index.css'
        },
        'manifest.webmanifest': {
            type: 'asset',
            fileName: 'manifest.webmanifest'
        },
        'sw.js': {
            type: 'asset',
            fileName: 'sw.js'
        }
    });

    assert.deepEqual(urls, [
        '/assets/index-main.js',
        '/assets/index.css',
        '/assets/runtime.js',
        '/assets/vendor-data.js',
        '/assets/vendor-react.js'
    ].sort());

    assert.equal(urls.includes('/assets/ItemForm.js'), false);
    assert.equal(urls.includes('/assets/Settings.js'), false);
    assert.equal(urls.includes('/assets/vendor-scanner.js'), false);
    assert.equal(urls.includes('/manifest.webmanifest'), false);
    assert.equal(urls.includes('/sw.js'), false);
});

test('PWA service worker isolates brand caches and removes legacy shared caches', () => {
    const source = createServiceWorker({
        legacyCachePrefix: 'home-inventory-static-',
        cachePrefix: 'home-inventory-custom-static',
        cacheName: 'home-inventory-custom-static-build-1',
        precacheUrls: ['/']
    });

    assert.match(source, /LEGACY_CACHE_PREFIX = "home-inventory-static-"/);
    assert.match(source, /CACHE_PREFIX = "home-inventory-custom-static"/);
    assert.match(source, /STATIC_CACHE = "home-inventory-custom-static-build-1"/);
    assert.match(source, /key\.startsWith\(LEGACY_CACHE_PREFIX\)/);
    assert.match(source, /key !== STATIC_CACHE/);
});
