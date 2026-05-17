import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLogger, defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_PACKAGE_VERSION = JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf8')
).version;
const LOGO_VERSION = '20260422-homeinventory-pwa-balanced';
const PWA_CACHE_PREFIX = 'home-inventory-static';

function deriveBrandName(siteHost) {
    if (!siteHost || /(^|\.)localhost$/.test(siteHost)) {
        return 'Inventory';
    }

    if (siteHost === 'homeinventory.net.tr') {
        return 'HomeInventory';
    }

    const [label] = siteHost.split('.');
    const normalized = label.replace(/[-_]+/g, ' ').trim();
    if (!normalized) {
        return 'Inventory';
    }

    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeBrandKey(value) {
    return String(value || '')
        .trim()
        .toLocaleLowerCase('en-US')
        .replace(/[^a-z0-9]+/g, '');
}

function withAssetVersion(assetPath) {
    const normalized = String(assetPath || '').trim();
    if (!normalized) {
        return '';
    }

    return normalized.includes('?') ? normalized : `${normalized}?v=${LOGO_VERSION}`;
}

function createMinimalDevLogger() {
    const logger = createLogger();
    const originalInfo = logger.info.bind(logger);

    logger.info = (msg, options) => {
        const normalized = String(msg || '').trim();

        if (
            !normalized ||
            normalized.startsWith('VITE ') ||
            normalized.includes('ready in') ||
            normalized.includes('Local:') ||
            normalized.includes('Network:') ||
            normalized.includes('press h + enter')
        ) {
            return;
        }

        originalInfo(msg, options);
    };

    return logger;
}

function createPwaManifest({
    id,
    brandName,
    description,
    themeColor,
    backgroundColor,
    icon192Path,
    icon512Path
}) {
    return JSON.stringify({
        id,
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

async function getCachedAppShell(cache) {
    return (
        (await cache.match(APP_SHELL_URL)) ||
        (await cache.match('/index.html')) ||
        null
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
            const cache = await caches.open(STATIC_CACHE);
            try {
                const response = await fetch(request);
                if (response.ok) {
                    await cache.put(APP_SHELL_URL, response.clone());
                    return response;
                }

                return (
                    (await getCachedAppShell(cache)) ||
                    (await cache.match(OFFLINE_FALLBACK_URL)) ||
                    response
                );
            } catch (error) {
                return (
                    (await getCachedAppShell(cache)) ||
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
    appleTouchIconPaths,
    brandAssetUrls,
    faviconPaths,
    manifestPaths,
    pwaIconPaths,
    themeColors
}) {
    const encodedBuildId = encodeURIComponent(buildId);
    const manifestId = `/app/default/${LOGO_VERSION}`;
    const manifestSources = {
        light: createPwaManifest({
            id: manifestId,
            brandName,
            description,
            themeColor: themeColors.light.themeColor,
            backgroundColor: themeColors.light.backgroundColor,
            icon192Path: pwaIconPaths.light.icon192,
            icon512Path: pwaIconPaths.light.icon512
        }),
        dark: createPwaManifest({
            id: manifestId,
            brandName,
            description,
            themeColor: themeColors.dark.themeColor,
            backgroundColor: themeColors.dark.backgroundColor,
            icon192Path: pwaIconPaths.dark.icon192,
            icon512Path: pwaIconPaths.dark.icon512
        })
    };
    const defaultManifestSource = manifestSources.light;
    const publicPrecacheUrls = [
        '/',
        '/offline.html',
        '/manifest.webmanifest',
        manifestPaths.light,
        manifestPaths.dark,
        pwaIconPaths.light.icon192,
        pwaIconPaths.light.icon512,
        pwaIconPaths.dark.icon192,
        pwaIconPaths.dark.icon512,
        appleTouchIconPaths.light,
        appleTouchIconPaths.dark,
        faviconPaths.light,
        faviconPaths.dark,
        ...brandAssetUrls,
        `/locales/en/translation.json?v=${encodedBuildId}`,
        `/locales/tr/translation.json?v=${encodedBuildId}`
    ];

    return {
        name: 'brand-pwa',
        configureServer(server) {
            const serveManifest = (manifestSource) => (req, res, next) => {
                if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
                    return next();
                }

                res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
                res.end(manifestSource);
            };

            server.middlewares.use('/manifest.webmanifest', serveManifest(defaultManifestSource));
            server.middlewares.use('/manifest-light.webmanifest', serveManifest(manifestSources.light));
            server.middlewares.use('/manifest-dark.webmanifest', serveManifest(manifestSources.dark));
        },
        generateBundle(_outputOptions, bundle) {
            const builtAssetUrls = Object.values(bundle)
                .map((file) => `/${file.fileName}`)
                .filter((pathname) => !pathname.endsWith('.map'))
                .filter((pathname) => !['/sw.js', '/manifest.webmanifest', '/manifest-light.webmanifest', '/manifest-dark.webmanifest'].includes(pathname));

            const precacheUrls = Array.from(new Set([
                ...publicPrecacheUrls,
                ...builtAssetUrls
            ])).sort();

            this.emitFile({
                type: 'asset',
                fileName: 'manifest.webmanifest',
                source: defaultManifestSource
            });

            this.emitFile({
                type: 'asset',
                fileName: 'manifest-light.webmanifest',
                source: manifestSources.light
            });

            this.emitFile({
                type: 'asset',
                fileName: 'manifest-dark.webmanifest',
                source: manifestSources.dark
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
export default defineConfig(({ command, mode }) => {
    const fileEnv = loadEnv(mode, path.resolve(__dirname, '..'), '');
    const env = { ...fileEnv, ...process.env };
    const backendPort = String(env.PORT || '3001').trim() || '3001';
    const frontendPort = Number.parseInt(String(env.FRONTEND_PORT || env.VITE_PORT || '5173'), 10) || 5173;
    const apiProxyTarget = env.VITE_API_PROXY_TARGET || `http://localhost:${backendPort}`;
    const customLogger = command === 'serve' ? createMinimalDevLogger() : undefined;
    const siteUrl = String(env.SITE_URL || '').trim();
    const rawBrandName = String(env.APP_BRAND_NAME || '').trim();
    const rawBrandKey = String(env.APP_BRAND_KEY || '').trim();
    const rawDataControllerName = String(env.APP_DATA_CONTROLLER_NAME || '').trim();
    const rawDataControllerAddress = String(env.APP_DATA_CONTROLLER_ADDRESS || '').trim();
    const rawDpoEmail = String(env.APP_DPO_EMAIL || '').trim();
    const rawPrivacyTransferDisclosure = String(env.APP_PRIVACY_TRANSFER_DISCLOSURE || '').trim();
    const rawPrivacyComplaintAuthority = String(env.APP_PRIVACY_COMPLAINT_AUTHORITY || '').trim();
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
    const appVersion = String(env.APP_VERSION || CLIENT_PACKAGE_VERSION || '1.1.0').trim();

    const brandKey = normalizeBrandKey(rawBrandKey) || 'homeinventory';
    const supportEmail = String(
        env.SUPPORT_EMAIL ||
        (derivedHost && !/(^|\.)localhost$/.test(derivedHost) ? `support@${derivedHost}` : 'support@example.com')
    ).trim();
    const metaDescription = `${brandName} - Evinizin tum esyalarini akillica yonetin`;
    const logoFullDarkPath = String(env.APP_BRAND_LOGO_FULL_DARK || '/brand/logo-full-dark.svg').trim();
    const logoFullLightPath = String(env.APP_BRAND_LOGO_FULL_LIGHT || '/brand/logo-full-light.svg').trim();
    const logoSymbolDarkPath = String(env.APP_BRAND_LOGO_SYMBOL_DARK || '/brand/logo-symbol-dark.svg').trim();
    const logoSymbolLightPath = String(env.APP_BRAND_LOGO_SYMBOL_LIGHT || '/brand/logo-symbol-light.svg').trim();
    const qrLogoPath = String(env.APP_QR_LOGO_PATH || logoSymbolLightPath).trim();
    const faviconLightPath = withAssetVersion(env.APP_FAVICON_LIGHT || logoSymbolLightPath);
    const faviconDarkPath = withAssetVersion(env.APP_FAVICON_DARK || logoSymbolDarkPath);
    const faviconPath = faviconLightPath;
    const themeColors = {
        light: {
            themeColor: String(env.APP_PWA_THEME_COLOR_LIGHT || '#f6f2e9').trim(),
            backgroundColor: String(env.APP_PWA_BACKGROUND_COLOR_LIGHT || '#f6f2e9').trim()
        },
        dark: {
            themeColor: String(env.APP_PWA_THEME_COLOR_DARK || '#1a1f1c').trim(),
            backgroundColor: String(env.APP_PWA_BACKGROUND_COLOR_DARK || '#1a1f1c').trim()
        }
    };
    const appleTouchIconLightPath = `/pwa/apple-touch-icon-light.png?v=${LOGO_VERSION}`;
    const appleTouchIconDarkPath = `/pwa/apple-touch-icon-dark.png?v=${LOGO_VERSION}`;
    const pwaIcon192LightPath = `/pwa/icon-light-192.png?v=${LOGO_VERSION}`;
    const pwaIcon192DarkPath = `/pwa/icon-dark-192.png?v=${LOGO_VERSION}`;
    const pwaIcon512LightPath = `/pwa/icon-light-512.png?v=${LOGO_VERSION}`;
    const pwaIcon512DarkPath = `/pwa/icon-dark-512.png?v=${LOGO_VERSION}`;
    const manifestLightPath = `/manifest-light.webmanifest?v=${LOGO_VERSION}`;
    const manifestDarkPath = `/manifest-dark.webmanifest?v=${LOGO_VERSION}`;
    const brandAssetUrls = [
        logoFullDarkPath,
        logoFullLightPath,
        logoSymbolDarkPath,
        logoSymbolLightPath
    ].filter(Boolean).map(withAssetVersion);

    return {
        clearScreen: false,
        customLogger,
        envDir: path.resolve(__dirname, '..'),
        build: {
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        if (!id.includes('node_modules')) {
                            return undefined;
                        }

                        if (
                            id.includes('/react/') ||
                            id.includes('/react-dom/') ||
                            id.includes('/scheduler/') ||
                            id.includes('/react-router/') ||
                            id.includes('/react-router-dom/')
                        ) {
                            return 'vendor-react';
                        }

                        if (
                            id.includes('/i18next/') ||
                            id.includes('/react-i18next/') ||
                            id.includes('/i18next-browser-languagedetector/') ||
                            id.includes('/i18next-http-backend/') ||
                            id.includes('/axios/')
                        ) {
                            return 'vendor-data';
                        }

                        if (id.includes('/html5-qrcode/')) {
                            return 'vendor-scanner';
                        }

                        if (id.includes('/qrcode/')) {
                            return 'vendor-qr';
                        }

                        if (id.includes('/lucide-react/')) {
                            return 'vendor-ui';
                        }

                        return undefined;
                    }
                }
            }
        },
        plugins: [
            react(),
            {
                name: 'brand-html',
                transformIndexHtml(html) {
                    return html
                        .replaceAll('__APP_BRAND_NAME__', brandName)
                        .replaceAll('__APP_META_DESCRIPTION__', metaDescription)
                        .replaceAll('__APP_FAVICON__', faviconPath)
                        .replaceAll('__APP_FAVICON_LIGHT__', faviconLightPath)
                        .replaceAll('__APP_FAVICON_DARK__', faviconDarkPath)
                        .replaceAll('__APP_MANIFEST_LIGHT__', manifestLightPath)
                        .replaceAll('__APP_MANIFEST_DARK__', manifestDarkPath)
                        .replaceAll('__APP_THEME_COLOR_LIGHT__', themeColors.light.themeColor)
                        .replaceAll('__APP_THEME_COLOR_DARK__', themeColors.dark.themeColor)
                        .replaceAll('__APP_APPLE_TOUCH_ICON__', appleTouchIconLightPath)
                        .replaceAll('__APP_APPLE_TOUCH_ICON_LIGHT__', appleTouchIconLightPath)
                        .replaceAll('__APP_APPLE_TOUCH_ICON_DARK__', appleTouchIconDarkPath);
                }
            },
            createPwaPlugin({
                brandName,
                description: metaDescription,
                buildId,
                appleTouchIconPaths: {
                    light: appleTouchIconLightPath,
                    dark: appleTouchIconDarkPath
                },
                brandAssetUrls,
                faviconPaths: {
                    light: faviconLightPath,
                    dark: faviconDarkPath
                },
                manifestPaths: {
                    light: manifestLightPath,
                    dark: manifestDarkPath
                },
                pwaIconPaths: {
                    light: {
                        icon192: pwaIcon192LightPath,
                        icon512: pwaIcon512LightPath
                    },
                    dark: {
                        icon192: pwaIcon192DarkPath,
                        icon512: pwaIcon512DarkPath
                    }
                },
                themeColors
            })
        ],
        define: {
            __APP_BRAND_NAME__: JSON.stringify(brandName),
            __APP_BRAND_KEY__: JSON.stringify(brandKey),
            __APP_BRAND_LOGO_FULL_DARK__: JSON.stringify(logoFullDarkPath),
            __APP_BRAND_LOGO_FULL_LIGHT__: JSON.stringify(logoFullLightPath),
            __APP_BRAND_LOGO_SYMBOL_DARK__: JSON.stringify(logoSymbolDarkPath),
            __APP_BRAND_LOGO_SYMBOL_LIGHT__: JSON.stringify(logoSymbolLightPath),
            __APP_QR_LOGO_PATH__: JSON.stringify(qrLogoPath),
            __APP_FAVICON_LIGHT__: JSON.stringify(faviconLightPath),
            __APP_FAVICON_DARK__: JSON.stringify(faviconDarkPath),
            __APP_THEME_COLOR_LIGHT__: JSON.stringify(themeColors.light.themeColor),
            __APP_THEME_COLOR_DARK__: JSON.stringify(themeColors.dark.themeColor),
            __APP_SITE_URL__: JSON.stringify(siteUrl),
            __APP_DATA_CONTROLLER_NAME__: JSON.stringify(rawDataControllerName),
            __APP_DATA_CONTROLLER_ADDRESS__: JSON.stringify(rawDataControllerAddress),
            __APP_DPO_EMAIL__: JSON.stringify(rawDpoEmail),
            __APP_PRIVACY_TRANSFER_DISCLOSURE__: JSON.stringify(rawPrivacyTransferDisclosure),
            __APP_PRIVACY_COMPLAINT_AUTHORITY__: JSON.stringify(rawPrivacyComplaintAuthority),
            __APP_SUPPORT_EMAIL__: JSON.stringify(supportEmail),
            __APP_VERSION__: JSON.stringify(appVersion),
            __APP_BUILD_ID__: JSON.stringify(buildId)
        },
        server: {
            port: frontendPort,
            strictPort: true, // Fail if port is in use
            host: '127.0.0.1', // Bind locally to avoid sandbox permission issues
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
            port: frontendPort,
            strictPort: true,
            host: '127.0.0.1'
        }
    };
});
