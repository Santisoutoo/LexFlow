import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { withTranslation, type WithTranslation } from 'react-i18next';

import { isChunkLoadError } from '@/lib/chunk-error';

/**
 * Route-level error boundary (issue #88, #45 R8).
 *
 * Catches uncaught render-time errors in the outlet and renders a
 * recovery screen. Chunk-load failures after a deploy get a reload-only
 * UX — resetting React state cannot fix a stale hashed asset URL.
 *
 * **Not** for API errors — those surface via TanStack Query toasts.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * Fallback UI            → ``renderFallback`` below
 * * Telemetry / Sentry     → ``componentDidCatch`` hook
 */

interface State {
  error: Error | null;
}

interface Props extends WithTranslation {
  children: ReactNode;
}

class ErrorBoundaryInner extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] uncaught render error', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  private reload = () => {
    window.location.reload();
  };

  render(): ReactNode {
    const error = this.state.error;
    if (error) {
      const { t } = this.props;
      const chunkError = isChunkLoadError(error);
      const title = chunkError ? t('errors.chunkLoadTitle') : t('errors.renderErrorTitle');
      const description = chunkError
        ? t('errors.chunkLoadDescription')
        : t('errors.renderErrorDescription');

      return (
        <div className="grid h-full place-items-center bg-bg p-6">
          <div className="max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg">
            <div className="flex items-center gap-2 text-danger">
              <AlertTriangle className="size-5" />
              <span className="text-base font-semibold">{title}</span>
            </div>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted">{description}</p>
            {!chunkError && (
              <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-border bg-bg p-2 font-mono text-[11.5px] text-fg">
                {error.message}
              </pre>
            )}
            <div className="mt-4 flex gap-2">
              {!chunkError && (
                <button
                  type="button"
                  onClick={this.reset}
                  className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
                >
                  {t('errors.retry')}
                </button>
              )}
              <button
                type="button"
                onClick={this.reload}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
              >
                {t('errors.reload')}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryInner);
