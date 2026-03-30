import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './i18n';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
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

ReactDOM.createRoot(document.getElementById('root')).render(
    <App />,
)
