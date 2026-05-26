import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';

interface AppErrorBoundaryProps {
    children: ReactNode;
}

interface AppErrorBoundaryState {
    hasError: boolean;
}

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
    state: AppErrorBoundaryState = {
        hasError: false
    };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('Application render error:', error, info);
    }

    private reloadPage = () => {
        window.location.reload();
    };

    private goHome = () => {
        window.location.assign('/');
    };

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        return (
            <main className="flex min-h-screen items-center justify-center bg-[var(--hi-bg)] px-4 py-10 text-[var(--hi-text)]">
                <section className="w-full max-w-xl rounded-[1.5rem] border border-[var(--hi-border)] bg-[var(--hi-panel)] p-6 text-center shadow-[var(--hi-shadow-lift)] sm:p-8">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--hi-danger-soft)] text-[var(--hi-danger)]">
                        <AlertTriangle className="h-6 w-6" />
                    </span>
                    <h1 className="section-title mt-5 text-2xl text-[var(--hi-text)]">Something needs a refresh</h1>
                    <p className="mt-3 text-sm leading-6 text-[var(--hi-text-soft)]">
                        The interface hit an unexpected rendering problem. Your saved inventory data is not changed by this screen.
                    </p>
                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                        <button type="button" onClick={this.reloadPage} className="btn-primary">
                            <RotateCcw className="h-4 w-4" />
                            Refresh
                        </button>
                        <button type="button" onClick={this.goHome} className="btn-secondary">
                            <Home className="h-4 w-4" />
                            Home
                        </button>
                    </div>
                </section>
            </main>
        );
    }
}
