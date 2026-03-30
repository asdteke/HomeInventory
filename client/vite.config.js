import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO_VERSION = '20260329-brandfix-logo';
const PWA_THEME_COLOR = '#6366f1';
const PWA_BACKGROUND_COLOR = '#f8fafc';
const PWA_CACHE_PREFIX = 'home-inventory-static';

function deriveBrandName(siteHost) {
    if (!siteHost || /(^|\.)localhost$/.test(siteHost)) {
        return 'Inventory';
    }

    if (siteHost === 'envanterim.net.tr') {
        return 'Envanterim';
    }

    const [label] = siteHost.split('.');
    const normalized = label.replace(/[-_]+/g, ' ').trim();
    if (!normalized) {
        return 'Inventory';
    }

    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function createPwaManifest({
    brandName,
    description,
    themeColor,
    backgroundColor,
    icon192Path,
    icon512Path
}) {
    return JSON.stringify({
        name: brandName,
        short_name: brandName,
        description,
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: backgroundColor,
        theme_color: themeColor,
        categories: ['productivity', 'utilities'],
        icons: [
            {
                src: icon192Path,
                sizes: '192x192',
                type: 'image/png'
            },
            {
                src: icon512Path,
                sizes: '512x512',
                type: 'image/png'
            }
        ]
    }, null, 2);
}

function createServiceWorker({ cacheName, precacheUrls }) {
    return `const CACHE_PREFIX = ${JSON.stringify(PWA_CACHE_PREFIX)};
const STATIC_CACHE = ${JSON.stringify(cacheName)};
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};
const APP_SHELL_URL = '/';
const OFFLINE_FALLBACK_URL = '/offline.html';

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const cacheKeys = await caches.keys();
        await Promise.all(
            cacheKeys
                .filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE)
                .map((key) => caches.delete(key))
        );
        await self.clients.claim();
    })());
});

function isBlockedPath(pathname) {
    return pathname.startsWith('/api/') || pathname.startsWith('/uploads/');
}

function isStaticAssetRequest(request, requestUrl) {
    if (request.method !== 'GET') return false;
    if (requestUrl.origin !== self.location.origin) return false;
    if (isBlockedPath(requestUrl.pathname)) return false;

    return (
        requestUrl.pathname.startsWith('/assets/') ||
        requestUrl.pathname.startsWith('/brand/') ||
        requestUrl.pathname.startsWith('/locales/') ||
        requestUrl.pathname.startsWith('/pwa/') ||
        requestUrl.pathname === '/' ||
        requestUrl.pathname === '/index.html' ||
        requestUrl.pathname === '/offline.html' ||
        requestUrl.pathname === '/manifest.webmanifest' ||
        ['style', 'script', 'worker', 'image', 'font', 'manifest'].includes(request.destination)
    );
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const requestUrl = new URL(request.url);

    if (request.method !== 'GET') return;
    if (requestUrl.origin !== self.location.origin) return;
    if (isBlockedPath(requestUrl.pathname)) return;

    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const response = await fetch(request);
                if (response.ok) {
                    const cache = await caches.open(STATIC_CACHE);
                    await cache.put(APP_SHELL_URL, response.clone());
                }
                return response;
            } catch (error) {
                const cache = await caches.open(STATIC_CACHE);
                return (
                    (await cache.match(APP_SHELL_URL)) ||
                    (await cache.match(OFFLINE_FALLBACK_URL)) ||
                    Response.error()
                );
            }
        })());
        return;
    }

    if (!isStaticAssetRequest(request, requestUrl)) {
        return;
    }

    event.respondWith((async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        if (cached) {
            return cached;
        }

        try {
            const response = await fetch(request);
            if (response.ok && response.type === 'basic') {
                await cache.put(request, response.clone());
            }
            return response;
        } catch (error) {
            return cached || Response.error();
        }
    })());
});
`;
}

function createPwaPlugin({
    brandName,
    description,
    buildId,
    appleTouchIconPath,
    brandAssetUrls,
    faviconPath,
    icon192Path,
    icon512Path
}) {
    const encodedBuildId = encodeURIComponent(buildId);
    const manifestSource = createPwaManifest({
        brandName,
        description,
        themeColor: PWA_THEME_COLOR,
        backgroundColor: PWA_BACKGROUND_COLOR,
        icon192Path,
        icon512Path
    });
    const publicPrecacheUrls = [
        '/',
        '/offline.html',
        '/manifest.webmanifest',
        icon192Path,
        icon512Path,
        appleTouchIconPath,
        faviconPath,
        ...brandAssetUrls,
        `/locales/en/translation.json?v=${encodedBuildId}`,
        `/locales/tr/translation.json?v=${encodedBuildId}`
    ];

    return {
        name: 'brand-pwa',
        configureServer(server) {
            server.middlewares.use('/manifest.webmanifest', (req, res, next) => {
                if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
                    return next();
                }

                res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
                res.end(manifestSource);
            });
        },
        generateBundle(_outputOptions, bundle) {
            const builtAssetUrls = Object.values(bundle)
                .map((file) => `/${file.fileName}`)
                .filter((pathname) => !pathname.endsWith('.map'))
                .filter((pathname) => pathname !== '/sw.js' && pathname !== '/manifest.webmanifest');

            const precacheUrls = Array.from(new Set([
                ...publicPrecacheUrls,
                ...builtAssetUrls
            ])).sort();

            this.emitFile({
                type: 'asset',
                fileName: 'manifest.webmanifest',
                source: manifestSource
            });

            this.emitFile({
                type: 'asset',
                fileName: 'sw.js',
                source: createServiceWorker({
                    cacheName: `${PWA_CACHE_PREFIX}-${buildId}`,
                    precacheUrls
                })
            });
        }
    };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, path.resolve(__dirname, '..'), '');
    const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3001';
    const siteUrl = String(env.SITE_URL || '').trim();
    const rawBrandName = String(env.APP_BRAND_NAME || '').trim();
    const buildId = String(
        env.APP_BUILD_ID ||
        env.VERCEL_GIT_COMMIT_SHA ||
        env.GITHUB_SHA ||
        new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
    ).trim();

    let derivedHost = '';
    try {
        derivedHost = new URL(siteUrl).hostname.replace(/^www\./, '');
    } catch {
        derivedHost = '';
    }

    const brandName = rawBrandName || deriveBrandName(derivedHost);

    const supportEmail = String(
        env.SUPPORT_EMAIL ||
        (derivedHost && !/(^|\.)localhost$/.test(derivedHost) ? `support@${derivedHost}` : 'support@example.com')
    ).trim();
    const metaDescription = `${brandName} - Evinizin tum esyalarini akillica yonetin`;
    const useLegacyBrandAssets = brandName === 'Envanterim' || derivedHost === 'envanterim.net.tr';
    const faviconPath = (
        useLegacyBrandAssets
            ? `/brand/logo-symbol.png?v=${LOGO_VERSION}`
            : `/brand/logo-symbol-light.png?v=${LOGO_VERSION}`
    );
    const appleTouchIconPath = (
        useLegacyBrandAssets
            ? '/pwa/apple-touch-icon-legacy.png'
            : '/pwa/apple-touch-icon.png'
    );
    const pwaIcon192Path = (
        useLegacyBrandAssets
            ? '/pwa/icon-legacy-192.png'
            : '/pwa/icon-192.png'
    );
    const pwaIcon512Path = (
        useLegacyBrandAssets
            ? '/pwa/icon-legacy-512.png'
            : '/pwa/icon-512.png'
    );
    const brandAssetUrls = useLegacyBrandAssets
        ? [
            `/brand/logo-full.png?v=${LOGO_VERSION}`,
            `/brand/logo-symbol.png?v=${LOGO_VERSION}`
        ]
        : [
            `/brand/logo-full-dark.png?v=${LOGO_VERSION}`,
            `/brand/logo-full-light.png?v=${LOGO_VERSION}`,
            `/brand/logo-symbol-dark.png?v=${LOGO_VERSION}`,
            `/brand/logo-symbol-light.png?v=${LOGO_VERSION}`
        ];

    return {
        envDir: path.resolve(__dirname, '..'),
        plugins: [
            react(),
            {
                name: 'brand-html',
                transformIndexHtml(html) {
                    return html
                        .replaceAll('__APP_BRAND_NAME__', brandName)
                        .replaceAll('__APP_META_DESCRIPTION__', metaDescription)
                        .replaceAll('__APP_FAVICON__', faviconPath)
                        .replaceAll('__APP_APPLE_TOUCH_ICON__', appleTouchIconPath);
                }
            },
            createPwaPlugin({
                brandName,
                description: metaDescription,
                buildId,
                appleTouchIconPath,
                brandAssetUrls,
                faviconPath,
                icon192Path: pwaIcon192Path,
                icon512Path: pwaIcon512Path
            })
        ],
        define: {
            __APP_BRAND_NAME__: JSON.stringify(brandName),
            __APP_SITE_URL__: JSON.stringify(siteUrl),
            __APP_SUPPORT_EMAIL__: JSON.stringify(supportEmail),
            __APP_BUILD_ID__: JSON.stringify(buildId)
        },
        server: {
            port: 5173,
            strictPort: true, // Fail if port is in use
            host: true, // Listen on all addresses (0.0.0.0) for network access
            proxy: {
                '/api': {
                    target: apiProxyTarget,
                    changeOrigin: true
                },
                '/uploads': {
                    target: apiProxyTarget,
                    changeOrigin: true
                }
            }
        },
        preview: {
            port: 5173,
            strictPort: true,
            host: true
        }
    };
});
