import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './performance-v25.css'
import './i18n';

function isPrivateLocalHost(hostname: string) {
    return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
    );
}

const shouldDisableServiceWorker = isPrivateLocalHost(window.location.hostname);

if (shouldDisableServiceWorker && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            registrations.forEach((registration) => {
                registration.unregister().catch((error) => {
                    console.warn('Service worker unregister failed:', error);
                });
            });
        });

        if ('caches' in window) {
            caches.keys().then((keys) => {
                keys
                    .filter((key) => /^home-inventory(?:-[a-z0-9]+)?-static(?:-|$)/.test(key))
                    .forEach((key) => caches.delete(key));
            });
        }
    });
}

if (import.meta.env.PROD && !shouldDisableServiceWorker && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register(`${import.meta.env.BASE_URL}sw.js`, {
                scope: import.meta.env.BASE_URL,
                updateViaCache: 'none'
            })
            .catch((error) => {
                console.error('Service worker registration failed:', error);
            });
    });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <App />,
)
