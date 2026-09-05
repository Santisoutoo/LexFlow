/**
 * Per-provider API key form. Shared by Settings → Modelos and the
 * model wizard cloud step (#28).
 *
 * Saves to the OS keyring via `liveSecretsApi`, then probes
 * `POST /secrets/{provider}/test` so Anthropic/Google keys are actually
 * validated (their `list_models` catalogues are static).
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Probe endpoint shape → `lib/api/secrets.ts` + `api/routers/secrets.py`.
 * Status copy mapping  → `lib/model-status.ts` (`cloudProviderStatus`).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, useConfirm } from '@/components/ui';
import { liveSecretsApi, type SecretStatusItem } from '@/lib/api/secrets';
import { cloudProviderStatus } from '@/lib/model-status';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

export type ApiKeyValidationState = 'idle' | 'validating' | 'valid' | 'invalid';

export interface ApiKeyRowProps {
  row: SecretStatusItem;
  onChange: () => Promise<void>;
  onModelsChange?: () => void;
  onValidationChange?: (state: ApiKeyValidationState, detail?: string) => void;
  /** After save, probe the provider. Default true. */
  validateOnSave?: boolean;
  compact?: boolean;
  showProviderLabel?: boolean;
}

export function ApiKeyRow({
  row,
  onChange,
  onModelsChange,
  onValidationChange,
  validateOnSave = true,
  compact = false,
  showProviderLabel = true,
}: ApiKeyRowProps) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const fromEnv = row.source === 'env';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || fromEnv) return;
    setBusy(true);
    onValidationChange?.('validating');
    try {
      await liveSecretsApi.set(row.provider, draft.trim());
      setDraft('');
      await onChange();
      onModelsChange?.();
      if (!validateOnSave) {
        toast({ tone: 'success', title: t('settings.models.apiKeySaved', { provider: row.provider }), message: '' });
        onValidationChange?.('idle');
        return;
      }
      const result = await liveSecretsApi.test(row.provider);
      if (result.valid) {
        toast({ tone: 'success', title: t('settings.models.apiKeySaved', { provider: row.provider }), message: '' });
        onValidationChange?.('valid');
        return;
      }
      const probe = cloudProviderStatus(result.message ?? result.code, true);
      toast({
        tone: 'warning',
        title: t('settings.models.apiKeySavedButRejected', { provider: row.provider }),
        message: probe.detail ?? result.message ?? '',
      });
      onValidationChange?.('invalid', probe.detail ?? result.message ?? undefined);
    } catch (exc) {
      onValidationChange?.('invalid');
      toast({
        tone: 'danger',
        title: t('settings.models.apiKeyFailed', { provider: row.provider }),
        message: exc instanceof Error ? exc.message : String(exc),
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (fromEnv) return;
    const ok = await confirm({
      title: t('common.delete'),
      message: t('settings.models.apiKeyConfirmDelete', { provider: row.provider }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await liveSecretsApi.remove(row.provider);
      await onChange();
      onModelsChange?.();
      onValidationChange?.('idle');
      toast({ tone: 'info', title: t('settings.models.apiKeyRemoved', { provider: row.provider }), message: '' });
    } catch (exc) {
      toast({
        tone: 'danger',
        title: t('settings.models.apiKeyFailed', { provider: row.provider }),
        message: exc instanceof Error ? exc.message : String(exc),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className={cn('flex flex-wrap items-center gap-2', compact && 'w-full')}>
      {showProviderLabel && (
        <div className="min-w-[110px]">
          <div className="font-semibold capitalize">{row.provider}</div>
          <div className="text-[12px] text-muted">
            {fromEnv
              ? t('settings.models.apiKeyFromEnv')
              : row.configured
                ? t('settings.models.apiKeyConfigured')
                : t('settings.models.apiKeyMissing')}
          </div>
        </div>
      )}
      {fromEnv && !showProviderLabel && (
        <p className="w-full text-[12.5px] text-muted">{t('wizard.cloudKeyFromEnv')}</p>
      )}
      <input
        type="password"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={
          row.configured
            ? t('settings.models.apiKeyPlaceholderConfigured')
            : t('settings.models.apiKeyPlaceholder')
        }
        className="min-w-[220px] flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 font-mono text-[12.5px] outline-none focus:border-indigo-500"
        disabled={busy || fromEnv}
      />
      <Button size="sm" type="submit" disabled={busy || fromEnv || !draft.trim()}>
        {busy ? t('settings.models.apiKeySaving') : t('settings.models.apiKeySave')}
      </Button>
      {row.configured && !fromEnv && (
        <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>
          {t('settings.models.apiKeyRemove')}
        </Button>
      )}
    </form>
  );
}
