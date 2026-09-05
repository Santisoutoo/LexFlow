/**
 * Model wizard — three-step onboarding flow (#118 / #28).
 *
 * Shown right after WelcomeFlow on first launch (and re-launchable from
 * Settings → Modelos). Walks the user through:
 *
 *   1. Detect hardware via `useSystemProfile` (#117).
 *   2. Pick one of the four tiers.
 *   3. Confirm + install. Local tiers: guided Ollama install + in-app
 *      `ollama pull`. Cloud tier: inline ApiKeyRow + real key probe.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Tier catalog + thresholds → `lib/model-tiering.ts`.
 * SPA-wide first-launch order → `main.tsx` (gate stacking).
 * Re-launch entrypoint → `pages/SettingsPage.tsx → ModelsSection`.
 * Key probe endpoint → `lib/api/secrets.ts` + `POST /secrets/{provider}/test`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Cloud,
  Copy,
  Cpu,
  Download,
  HardDrive,
  RefreshCw,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';

import { Badge, Button } from '@/components/ui';
import { ApiKeyRow, type ApiKeyValidationState } from '@/components/domain/ApiKeyRow';
import { Skeleton } from '@/components/domain/Skeleton';
import { api } from '@/lib/api';
import { liveSecretsApi, type SecretStatusItem } from '@/lib/api/secrets';
import {
  FIT_LABELS,
  FIT_TONES,
  TIER_CATALOG,
  fitForModel,
  recommendTier,
  resolveModelIdForTier,
  type FitStatus,
  type ModelTier,
  type TierKey,
} from '@/lib/model-tiering';
import { qk, useInvalidateModels, useModels, useSystemProfile } from '@/lib/queries';
import { useUi } from '@/lib/store';
import { toast } from '@/lib/toast';
import type { SystemProfile } from '@/lib/types';
import { cn } from '@/lib/utils';

export const WIZARD_COMPLETED_STORAGE_KEY = 'lexflow.wizard-completed';

type Step = 1 | 2 | 3;

const OLLAMA_POLL_INTERVAL_MS = 5_000;
const OLLAMA_POLL_MAX_MS = 5 * 60 * 1_000;
const LINUX_INSTALL_COMMAND = 'curl -fsSL https://ollama.com/install.sh | sh';
const ANTHROPIC_KEYS_URL = 'https://console.anthropic.com/settings/keys';

function ollamaDownloadUrl(platform: string): string {
  if (platform === 'windows') return 'https://ollama.com/download/windows';
  if (platform === 'darwin') return 'https://ollama.com/download/mac';
  return 'https://ollama.com/download/linux';
}

type ProfileRefetch = () => Promise<{ data?: SystemProfile | null } | void> | void;

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Render-prop gate. Shows the wizard before children whenever the user
 * hasn't completed it yet. Mirrors the WelcomeFlow gate pattern so the
 * `main.tsx` stack stays uniform: SplashGate → WelcomeFlow → ModelWizardGate
 * → App.
 */
export function ModelWizardGate({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(() => !readWizardCompleted());

  if (!open) return <>{children}</>;

  return (
    <>
      {children}
      <ModelWizard
        onComplete={() => {
          markWizardCompleted();
          setOpen(false);
        }}
        onSkip={() => {
          // "Saltar" (X button) doesn't mark the wizard as completed — it
          // stays available from Settings. We close the modal for this
          // session via a separate storage key.
          markWizardSkipped();
          setOpen(false);
        }}
        onLater={() => {
          // "Lo haré más tarde" (footer button) permanently marks the wizard
          // done without persisting a model choice — leaves the chat in
          // "no model configured" state until the user visits Settings → Modelos.
          markWizardCompleted();
          setOpen(false);
        }}
      />
    </>
  );
}

/**
 * Standalone wizard (no gate). Used by the "Volver a lanzar wizard"
 * button in Settings → Modelos, where the parent owns the open state.
 *
 * Props:
 *   onComplete   — model chosen + persisted; wizard is done.
 *   onSkip       — X button: session-only dismiss (wizard reappears next launch).
 *   onLater      — "Lo haré más tarde" footer button: marks wizard permanently
 *                  done WITHOUT persisting a model choice (user sets up in Settings).
 */
export function ModelWizard({
  onComplete,
  onSkip,
  onLater,
}: {
  onComplete: (tier: TierKey) => void;
  onSkip: () => void;
  onLater: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const profileQuery = useSystemProfile();
  const { data: models = [] } = useModels();
  const invalidateModels = useInvalidateModels();
  const setDefaultModel = useUi((s) => s.setDefaultModel);
  const [step, setStep] = useState<Step>(1);
  const [selectedKey, setSelectedKey] = useState<TierKey | null>(null);
  const [cloudKeyState, setCloudKeyState] = useState<ApiKeyValidationState>('idle');
  // #27 — local tiers: true once Ollama reports the model installed.
  const [localInstallReady, setLocalInstallReady] = useState(false);

  // Once the profile loads, pre-select the recommended tier. Re-runs
  // when refetch returns new data, but only if the user hasn't picked
  // one manually yet.
  useEffect(() => {
    if (profileQuery.data && selectedKey === null) {
      setSelectedKey(recommendTier(profileQuery.data));
    }
  }, [profileQuery.data, selectedKey]);

  useEffect(() => {
    setLocalInstallReady(false);
    setCloudKeyState('idle');
  }, [selectedKey]);

  const profile = profileQuery.data ?? null;
  const selectedTier =
    TIER_CATALOG.find((t) => t.key === selectedKey) ?? TIER_CATALOG[0];

  const stepCount = 3;
  const goBack = () => setStep((s) => Math.max(1, s - 1) as Step);
  const goNext = () => setStep((s) => Math.min(stepCount, s + 1) as Step);

  const finish = async () => {
    const cloudKeyReady = cloudKeyState === 'valid';
    const finishBlocked =
      (selectedTier.cloud && !cloudKeyReady) || (!selectedTier.cloud && !localInstallReady);
    if (finishBlocked) return;

    let freshModels = models;
    try {
      freshModels = await api.models.list({ refresh: true });
    } catch {
      toast({
        tone: 'danger',
        title: t('wizard.modelNotReady'),
        message: t('wizard.modelNotReadyHint'),
      });
      return;
    }

    const id = resolveModelIdForTier(selectedTier, freshModels);
    if (!id) {
      toast({
        tone: 'danger',
        title: t('wizard.modelNotReady'),
        message: t('wizard.modelNotReadyHint'),
      });
      return;
    }

    queryClient.setQueryData(qk.models(), freshModels);
    invalidateModels();
    setDefaultModel(id);
    toast({ tone: 'success', title: t('wizard.readyToChat'), message: selectedTier.model });
    onComplete(selectedTier.key);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('wizard.dialogAria')}
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/35 backdrop-blur-md p-4"
    >
      <div className="air-glass-strong w-full max-w-2xl p-7 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <WizardHeader step={step} stepCount={stepCount} onSkip={onSkip} />

        {step === 1 && (
          <StepDetect profile={profile} loading={profileQuery.isLoading} onRefetch={profileQuery.refetch} />
        )}
        {step === 2 && profile && (
          <StepPick profile={profile} selectedKey={selectedTier.key} onSelect={setSelectedKey} />
        )}
        {step === 3 && (
          <StepConfirm
            tier={selectedTier}
            profile={profile}
            onRefetchProfile={profileQuery.refetch}
            onCloudKeyChange={setCloudKeyState}
            onLocalInstallReadyChange={setLocalInstallReady}
          />
        )}

        <WizardFooter
          step={step}
          tier={selectedTier}
          profileReady={!!profile}
          cloudKeyState={cloudKeyState}
          localInstallReady={localInstallReady}
          onBack={goBack}
          onNext={goNext}
          onFinish={() => void finish()}
          onLater={onLater}
        />
      </div>
    </div>
  );
}

// ─── Header + footer ─────────────────────────────────────────────────────

function WizardHeader({ step, stepCount, onSkip }: { step: Step; stepCount: number; onSkip: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <div className="label-caps text-muted">{t('wizard.stepOf', { step, total: stepCount })}</div>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">
          {step === 1 && t('wizard.step1Title')}
          {step === 2 && t('wizard.step2Title')}
          {step === 3 && t('wizard.step3Title')}
        </h2>
      </div>
      <button
        type="button"
        onClick={onSkip}
        aria-label={t('wizard.closeAria')}
        className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function WizardFooter({
  step,
  tier,
  profileReady,
  cloudKeyState,
  localInstallReady,
  onBack,
  onNext,
  onFinish,
  onLater,
}: {
  step: Step;
  tier: ModelTier;
  profileReady: boolean;
  cloudKeyState: ApiKeyValidationState;
  /** #27 — true once the local model is installed and ready. */
  localInstallReady: boolean;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
  /** #673 — permanently marks wizard done without a model; user finishes in Settings. */
  onLater: () => void;
}) {
  const { t } = useTranslation();
  const isLast = step === 3;
  const cloudKeyReady = cloudKeyState === 'valid';

  const finishDisabled =
    isLast && ((tier.cloud && !cloudKeyReady) || (!tier.cloud && !localInstallReady));

  const finishHint = !tier.cloud
    ? t('wizard.finishDisabledHint')
    : cloudKeyState === 'invalid'
      ? t('wizard.cloudKeyInvalid')
      : t('wizard.finishDisabledCloudKey');

  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {step > 1 ? (
          <Button variant="ghost" onClick={onBack}>
            {t('wizard.back')}
          </Button>
        ) : (
          <span />
        )}
        {step >= 2 && (
          <Button variant="ghost" onClick={onLater} className="text-muted text-[13px]">
            {t('wizard.skipLater')}
          </Button>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        {finishDisabled && (
          <span className="text-[11.5px] text-muted">{finishHint}</span>
        )}
        <Button
          variant="primary"
          onClick={isLast ? onFinish : onNext}
          disabled={(step === 1 && !profileReady) || finishDisabled}
        >
          {isLast ? t('wizard.use', { tier: tier.title.split(' — ')[0].toLowerCase() }) : t('wizard.continue')}
        </Button>
      </div>
    </div>
  );
}

// ─── Step 1 — Detect ─────────────────────────────────────────────────────

function StepDetect({
  profile,
  loading,
  onRefetch,
}: {
  profile: SystemProfile | null;
  loading: boolean;
  onRefetch: ProfileRefetch;
}) {
  const { t } = useTranslation();
  if (loading || !profile) {
    return (
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-2/3" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <DetectRow icon={<HardDrive className="size-3.5" />} label="RAM" value={t('wizard.ramValue', { total: profile.totalRamGb, free: profile.availableRamGb })} />
      <DetectRow icon={<Cpu className="size-3.5" />} label="CPU" value={t('wizard.cpuValue', { cores: profile.cpuCores })} />
      <DetectRow
        icon={<Sparkles className="size-3.5" />}
        label="GPU"
        value={
          profile.hasNvidiaGpu && profile.vramGb
            ? t('wizard.gpuNvidia', { name: profile.gpuName ?? 'NVIDIA', vram: profile.vramGb })
            : profile.isAppleSilicon
              ? t('wizard.gpuApple')
              : t('wizard.gpuNone')
        }
      />
      <DetectRow
        icon={<Cpu className="size-3.5" />}
        label={t('wizard.platformLabel')}
        value={profile.platform}
      />
      <DetectRow
        icon={profile.ollamaRunning ? <CheckCircle2 className="size-3.5 text-success" /> : <XCircle className="size-3.5 text-muted" />}
        label="Ollama"
        value={
          profile.ollamaRunning
            ? t('wizard.ollamaRunning', { count: profile.ollamaModels.length })
            : t('wizard.notDetected')
        }
      />
      <DetectRow
        icon={profile.lmstudioRunning ? <CheckCircle2 className="size-3.5 text-success" /> : <XCircle className="size-3.5 text-muted" />}
        label="LM Studio"
        value={profile.lmstudioRunning ? t('wizard.lmstudioRunning') : t('wizard.notDetected')}
      />

      {!profile.ollamaRunning && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-border bg-surface p-3 text-[12.5px] text-muted">
          <span>
            {t('wizard.redetectHint')}
          </span>
          <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={() => void onRefetch()}>
            {t('wizard.redetect')}
          </Button>
        </div>
      )}
    </div>
  );
}

function DetectRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 text-[13.5px]">
      <span className="inline-flex size-6 items-center justify-center rounded-md bg-surface-2 text-muted">
        {icon}
      </span>
      <span className="font-medium text-muted">{label}</span>
      <span className="ml-auto text-right text-fg">{value}</span>
    </div>
  );
}

// ─── Step 2 — Pick ───────────────────────────────────────────────────────

function StepPick({
  profile,
  selectedKey,
  onSelect,
}: {
  profile: SystemProfile;
  selectedKey: TierKey;
  onSelect: (key: TierKey) => void;
}) {
  const recommendedKey = useMemo(() => recommendTier(profile), [profile]);
  return (
    <div className="flex flex-col gap-3 pt-1">
      {TIER_CATALOG.map((tier) => {
        const fit = fitForModel(profile, tier);
        const isSelected = tier.key === selectedKey;
        const isRecommended = tier.key === recommendedKey;
        return (
          <TierCard
            key={tier.key}
            tier={tier}
            fit={fit}
            selected={isSelected}
            recommended={isRecommended}
            onClick={() => onSelect(tier.key)}
          />
        );
      })}
    </div>
  );
}

function TierCard({
  tier,
  fit,
  selected,
  recommended,
  onClick,
}: {
  tier: ModelTier;
  fit: FitStatus;
  selected: boolean;
  recommended: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const tone = FIT_TONES[fit];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'group relative w-full rounded-xl border p-4 text-left transition-all',
        selected
          ? 'border-indigo-500 bg-primary-soft/40 ring-1 ring-indigo-500/30'
          : recommended
            ? 'border-indigo-300/70 bg-surface hover:bg-surface-2 dark:border-indigo-400/40'
            : 'border-border bg-surface hover:border-border-strong hover:bg-surface-2',
      )}
    >
      {recommended && (
        // Hero ribbon — ties the recommendation to the detected machine.
        <span className="absolute -top-2 left-4 inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[10.5px] font-semibold text-white shadow-sm">
          <Sparkles className="size-2.5" /> {t('wizard.recommendedForYou')}
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {selected && <CheckCircle2 className="size-4 shrink-0 text-indigo-600 dark:text-indigo-300" />}
            <span className="font-display text-[15px] font-semibold">{tier.title}</span>
          </div>
          <div className="mt-0.5 font-mono text-[11.5px] text-muted">{tier.model}</div>
          <p className="mt-1.5 text-[12.5px] text-muted">{tier.blurb}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-muted">
              {tier.cloud ? <Cloud className="size-3" /> : <HardDrive className="size-3" />}
              {tier.cloud ? t('model.cloud') : t('model.local')}
            </span>
            {tier.sizeGb != null && !tier.cloud && (
              <span className="inline-flex items-center rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-muted">
                {tier.sizeGb} GB
              </span>
            )}
          </div>
        </div>
        <Badge tone={tone} className="mt-0.5 shrink-0">{FIT_LABELS[fit]}</Badge>
      </div>
    </button>
  );
}

// ─── Step 3 — Confirm ────────────────────────────────────────────────────

function StepConfirm({
  tier,
  profile,
  onRefetchProfile,
  onCloudKeyChange,
  onLocalInstallReadyChange,
}: {
  tier: ModelTier;
  profile: SystemProfile | null;
  onRefetchProfile: ProfileRefetch;
  onCloudKeyChange: (state: ApiKeyValidationState) => void;
  /** #27 — called when local install readiness changes. */
  onLocalInstallReadyChange: (ready: boolean) => void;
}) {
  if (tier.cloud) {
    return <CloudKeyConfirm tier={tier} onKeyStatusChange={onCloudKeyChange} />;
  }

  const isInstalled = profile?.ollamaModels.includes(tier.model) ?? false;
  return (
    <OllamaInstall
      tier={tier}
      isInstalled={isInstalled}
      ollamaRunning={profile?.ollamaRunning ?? false}
      platform={profile?.platform ?? 'linux'}
      onRefetchProfile={onRefetchProfile}
      onReadyChange={onLocalInstallReadyChange}
    />
  );
}

/**
 * Step 3 — cloud path (#28).
 *
 * Inline ApiKeyRow + real `POST /secrets/anthropic/test`. "Usar" is
 * gated on a *valid* probe, not merely "key configured". Returning users
 * with a stored key get an automatic probe on mount.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Secrets endpoint shape → `lib/api/secrets.ts` + `api/routers/secrets.py`.
 * Cloud provider name → Anthropic (wizard catalog `CLOUD_PROVIDER`).
 */
function CloudKeyConfirm({
  tier,
  onKeyStatusChange,
}: {
  tier: ModelTier;
  onKeyStatusChange: (state: ApiKeyValidationState) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [row, setRow] = useState<SecretStatusItem>({ provider: 'anthropic', configured: false });
  const [validation, setValidation] = useState<ApiKeyValidationState>('idle');

  const refreshRow = useCallback(async (): Promise<SecretStatusItem> => {
    const items = await liveSecretsApi.list();
    const anthropic = items.find((item) => item.provider === 'anthropic');
    const next = anthropic ?? { provider: 'anthropic' as const, configured: false };
    setRow(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const current = await refreshRow();
        if (cancelled) return;
        if (!current.configured) {
          setValidation('idle');
          onKeyStatusChange('idle');
          return;
        }
        setValidation('validating');
        onKeyStatusChange('validating');
        const result = await liveSecretsApi.test('anthropic');
        if (cancelled) return;
        const next: ApiKeyValidationState = result.valid ? 'valid' : 'invalid';
        setValidation(next);
        onKeyStatusChange(next);
      } catch {
        if (cancelled) return;
        setValidation('idle');
        onKeyStatusChange('idle');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [onKeyStatusChange, refreshRow]);

  const handleValidationChange = (state: ApiKeyValidationState) => {
    setValidation(state);
    onKeyStatusChange(state);
  };

  return (
    <div className="flex flex-col gap-3 text-[13.5px]">
      <p>
        {t('wizard.cloudChosen')} <strong>{tier.title}</strong>. {t('wizard.cloudKeyInstructions')}
      </p>
      <p className="text-muted">
        <Trans
          i18nKey="wizard.cloudCreateKey"
          components={{
            link: (
              <a
                href={ANTHROPIC_KEYS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 underline underline-offset-2 dark:text-indigo-300"
              />
            ),
          }}
        />
      </p>

      {validation === 'validating' && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface p-3 text-[12.5px] text-muted">
          <RefreshCw className="size-3.5 animate-spin" />
          <span>{t('wizard.cloudKeyRefresh')}…</span>
        </div>
      )}
      {validation === 'valid' && (
        <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success-soft p-3">
          <CheckCircle2 className="size-4 text-success" />
          <span className="text-success font-medium">{t('wizard.cloudKeyReady')}</span>
        </div>
      )}
      {validation === 'invalid' && (
        <div className="rounded-md border border-amber-300/60 bg-amber-soft p-3 text-[12.5px] text-amber-700 dark:text-amber-300">
          {t('wizard.cloudKeyInvalid')}
        </div>
      )}
      {validation === 'idle' && (
        <p className="text-[12.5px] text-muted">{t('wizard.cloudKeyNotSet')}</p>
      )}

      <ApiKeyRow
        row={row}
        onChange={async () => {
          await refreshRow();
        }}
        onValidationChange={handleValidationChange}
        validateOnSave
        compact
        showProviderLabel={false}
      />

      <button
        type="button"
        onClick={() => navigate('/settings')}
        className="self-start text-[12px] text-muted underline underline-offset-2 hover:text-fg"
      >
        {t('wizard.openSettings')}
      </button>
    </div>
  );
}

function ollamaRunningFromRefetch(result: unknown): boolean | undefined {
  if (!result || typeof result !== 'object') return undefined;
  if ('data' in result) {
    const data = (result as { data?: { ollamaRunning?: boolean } }).data;
    if (data && typeof data.ollamaRunning === 'boolean') return data.ollamaRunning;
  }
  if ('ollamaRunning' in result && typeof (result as { ollamaRunning?: unknown }).ollamaRunning === 'boolean') {
    return (result as { ollamaRunning: boolean }).ollamaRunning;
  }
  return undefined;
}

/**
 * Guided Ollama install when the daemon is not running. Polls
 * `GET /system/profile` locally (never via `useSystemProfile`'s timer)
 * every 5 s for up to 5 min.
 */
function OllamaSetupGuide({
  platform,
  ollamaRunning,
  onRefetchProfile,
  onDetected,
}: {
  platform: string;
  ollamaRunning: boolean;
  onRefetchProfile: ProfileRefetch;
  onDetected: () => void;
}) {
  const { t } = useTranslation();
  const [timedOut, setTimedOut] = useState(false);
  const [copied, setCopied] = useState(false);
  const isLinux = platform === 'linux';
  const downloadUrl = ollamaDownloadUrl(platform);

  useEffect(() => {
    if (ollamaRunning) {
      onDetected();
      return;
    }
    let cancelled = false;
    let intervalId = 0;
    const started = Date.now();
    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - started >= OLLAMA_POLL_MAX_MS) {
        setTimedOut(true);
        window.clearInterval(intervalId);
        return;
      }
      const result = await onRefetchProfile();
      if (cancelled) return;
      if (ollamaRunningFromRefetch(result)) onDetected();
    };
    void tick();
    intervalId = window.setInterval(() => {
      void tick();
    }, OLLAMA_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [ollamaRunning, onDetected, onRefetchProfile]);

  const copyLinuxCommand = async () => {
    try {
      await navigator.clipboard.writeText(LINUX_INSTALL_COMMAND);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 text-[13.5px]">
      <div className="rounded-md border border-amber-300/60 bg-amber-soft p-3 text-amber-700 dark:text-amber-300">
        <div className="font-semibold">{t('wizard.ollamaInstallTitle')}</div>
        <p className="mt-1">{t('wizard.ollamaInstallBody')}</p>
      </div>
      {isLinux ? (
        <div className="rounded-md border border-border bg-surface p-3">
          <p className="mb-2 text-[12.5px] text-muted">{t('wizard.ollamaLinuxHint')}</p>
          <pre className="overflow-x-auto rounded bg-surface-2 px-2.5 py-2 font-mono text-[12px]">{LINUX_INSTALL_COMMAND}</pre>
          <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={() => void copyLinuxCommand()} className="mt-2">
            {copied ? t('wizard.copied') : t('wizard.copyCommand')}
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          icon={<Download className="size-3.5" />}
          onClick={() => window.open(downloadUrl, '_blank', 'noopener,noreferrer')}
          className="self-start"
        >
          {t('wizard.ollamaDownload')}
        </Button>
      )}
      {timedOut ? (
        <p className="text-[12.5px] text-muted">{t('wizard.ollamaPollTimeout')}</p>
      ) : (
        <div className="flex items-center gap-2 text-[12.5px] text-muted">
          <RefreshCw className="size-3.5 animate-spin" />
          <span>{t('wizard.ollamaPolling')}</span>
        </div>
      )}
      <Button
        size="sm"
        variant="ghost"
        icon={<RefreshCw className="size-3.5" />}
        onClick={async () => {
          const result = await onRefetchProfile();
          if (ollamaRunningFromRefetch(result)) onDetected();
        }}
        className="self-start"
      >
        {t('wizard.redetect')}
      </Button>
    </div>
  );
}

/**
 * Step 3 — in-app Ollama install (#119 / #28).
 *
 * When Ollama is not running, `OllamaSetupGuide` polls until it is.
 * Then the existing pull flow (idle → pulling → done/error) takes over.
 */
function OllamaInstall({
  tier,
  isInstalled,
  ollamaRunning,
  platform,
  onRefetchProfile,
  onReadyChange,
}: {
  tier: ModelTier;
  isInstalled: boolean;
  ollamaRunning: boolean;
  platform: string;
  onRefetchProfile: ProfileRefetch;
  onReadyChange: (ready: boolean) => void;
}) {
  const { t } = useTranslation();
  type PullState =
    | { phase: 'idle' }
    | { phase: 'pulling'; status: string | null; completed: number | null; total: number | null }
    | { phase: 'done' }
    | { phase: 'error'; code: string; message: string };

  const [state, setState] = useState<PullState>(isInstalled ? { phase: 'done' } : { phase: 'idle' });
  const [detected, setDetected] = useState(ollamaRunning);
  const markDetected = useCallback(() => setDetected(true), []);

  useEffect(() => {
    setDetected(ollamaRunning);
  }, [ollamaRunning]);

  useEffect(() => {
    onReadyChange(state.phase === 'done');
  }, [state.phase, onReadyChange]);

  const startPull = async () => {
    setState({ phase: 'pulling', status: t('wizard.connecting'), completed: null, total: null });
    try {
      for await (const event of api.models.pull(tier.model)) {
        if (event.type === 'progress') {
          setState({
            phase: 'pulling',
            status: event.status,
            completed: event.completed,
            total: event.total,
          });
        } else if (event.type === 'done') {
          setState({ phase: 'done' });
          void onRefetchProfile();
          toast({ tone: 'success', title: t('wizard.installedToast'), message: tier.model });
          return;
        } else {
          setState({ phase: 'error', code: event.code, message: event.message });
          return;
        }
      }
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : t('wizard.pullFailed');
      setState({ phase: 'error', code: 'network', message });
    }
  };

  if (state.phase === 'done') {
    return (
      <div className="flex flex-col gap-3 text-[13.5px]">
        <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success-soft p-3">
          <CheckCircle2 className="size-4 text-success" />
          <span className="text-success font-medium">
            <strong>{tier.model}</strong> {t('wizard.installedReady')}
          </span>
        </div>
      </div>
    );
  }

  if (state.phase === 'pulling') {
    const pct = state.total ? Math.round(((state.completed ?? 0) / state.total) * 100) : null;
    return (
      <div className="flex flex-col gap-3 text-[13.5px]">
        <p>
          {t('wizard.installing')} <strong>{tier.model}</strong>…
        </p>
        <div className="rounded-md border border-border bg-surface p-3">
          <div className="mb-2 flex items-center justify-between text-[12px] text-muted">
            <span>{state.status ?? t('wizard.inProgress')}</span>
            {pct !== null && <span className="font-mono">{pct}%</span>}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-indigo-500 transition-[width] duration-200"
              style={{ width: `${pct ?? 0}%` }}
            />
          </div>
        </div>
        <p className="text-[12px] text-muted">
          {t('wizard.pullBackgroundHint')}
        </p>
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className="flex flex-col gap-3 text-[13.5px]">
        <div className="rounded-md border border-danger/30 bg-danger-soft p-3 text-danger">
          <strong>{t('wizard.installFailed')}</strong> {state.message}
        </div>
        <Button size="sm" variant="secondary" onClick={() => void startPull()} className="self-start">
          {t('wizard.retry')}
        </Button>
      </div>
    );
  }

  if (!detected) {
    return (
      <OllamaSetupGuide
        platform={platform}
        ollamaRunning={ollamaRunning}
        onRefetchProfile={onRefetchProfile}
        onDetected={markDetected}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 text-[13.5px]">
      <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success-soft p-3">
        <CheckCircle2 className="size-4 text-success" />
        <span className="text-success font-medium">{t('wizard.ollamaDetected')}</span>
      </div>
      <p>
        {t('wizard.downloadIntroPre')} <strong>{tier.model}</strong> {t('wizard.downloadIntroPost', { size: tier.sizeGb })}
      </p>
      <div className="flex items-center gap-2.5">
        <Button
          variant="primary"
          icon={<Download className="size-3.5" />}
          onClick={() => void startPull()}
        >
          {t('wizard.install')}
        </Button>
        <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={() => void onRefetchProfile()}>
          {t('wizard.redetect')}
        </Button>
      </div>
    </div>
  );
}

// ─── localStorage helpers ────────────────────────────────────────────────

function readWizardCompleted(): boolean {
  try {
    return localStorage.getItem(WIZARD_COMPLETED_STORAGE_KEY) === 'true';
  } catch {
    return true;
  }
}

function markWizardCompleted(): void {
  try {
    localStorage.setItem(WIZARD_COMPLETED_STORAGE_KEY, 'true');
  } catch {
    /* private mode — ignore. */
  }
}

const WIZARD_SKIPPED_SESSION_KEY = 'lexflow.wizard-skipped-session';

function markWizardSkipped(): void {
  // Session-scoped so the wizard reappears next launch (it's the only
  // discoverability lever for the model setup we have today).
  try {
    sessionStorage.setItem(WIZARD_SKIPPED_SESSION_KEY, 'true');
  } catch {
    /* ignore */
  }
}
