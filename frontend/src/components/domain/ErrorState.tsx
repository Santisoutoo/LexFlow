import { useTranslation } from 'react-i18next';
import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { errorDisplay } from '@/lib/errors';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  title?: string;
  description?: React.ReactNode;
  error?: unknown;
  onRetry?: () => void;
  reportHref?: string;
  className?: string;
}

export function ErrorState({ title, description, error, onRetry, reportHref, className }: ErrorStateProps) {
  const { t } = useTranslation();
  const resolved = error != null ? errorDisplay(error, t) : null;
  const message = resolved?.message ?? (typeof description === 'string' ? description : null);
  const detail = resolved?.detail;

  return (
    <div className={cn(
      'rounded-lg border border-danger/30 bg-danger-soft/40 px-7 py-8 text-center',
      className,
    )}>
      <XCircle className="mx-auto size-9 text-danger" />
      <h3 className="mt-2.5 font-display text-base font-semibold">{title ?? t('errors.somethingWrong')}</h3>
      {message && <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{message}</p>}
      {!message && description && typeof description !== 'string' && (
        <div className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{description}</div>
      )}
      {detail && (
        <details className="mx-auto mt-2 max-w-sm text-left">
          <summary className="cursor-pointer text-[12px] text-muted">{t('errors.showDetails')}</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-bg p-2 font-mono text-[11px] text-muted">
            {detail}
          </pre>
        </details>
      )}
      <div className="mt-3.5 inline-flex gap-2">
        {onRetry && <Button size="sm" onClick={onRetry}>{t('errors.retry')}</Button>}
        {reportHref && (
          <a href={reportHref} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="ghost">{t('errors.reportBug')}</Button>
          </a>
        )}
      </div>
    </div>
  );
}
