import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './i18n';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div></div>}>
            <App />
        </Suspense>
    </React.StrictMode>,
)
