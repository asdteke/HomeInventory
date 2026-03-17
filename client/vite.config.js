import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        strictPort: true, // Fail if port is in use
        host: true, // Listen on all addresses (0.0.0.0) for network access
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true
            },
            '/uploads': {
                target: 'http://localhost:3001',
                changeOrigin: true
            }
        }
    },
    preview: {
        port: 5173,
        strictPort: true,
        host: true
    }
});
