import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AppSidebar } from './AppSidebar';
import './styles.css';

// The optional app window loads this same bundle in its sidebar webview.
function isAppSidebar() {
  const internals = (window as Window & {
    __TAURI_INTERNALS__?: { metadata?: { currentWebview?: { label?: string } } };
  }).__TAURI_INTERNALS__;
  const label = internals?.metadata?.currentWebview?.label;
  if (label) return label === 'app-sidebar';
  // Browser preview of the sidebar: http://127.0.0.1:1420/?view=sidebar
  return new URLSearchParams(window.location.search).get('view') === 'sidebar';
}

const sidebar = isAppSidebar();
if (sidebar) document.body.classList.add('app-sidebar-body');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {sidebar ? <AppSidebar /> : <App />}
  </React.StrictMode>
);
