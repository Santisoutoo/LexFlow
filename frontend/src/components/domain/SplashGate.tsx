/**
 * SplashGate — branded splash that gates the whole app until warm-up is ready.
 *
 * Mounts outside the Router (see main.tsx) so no route renders until the
 * backend's core warm-up stages (metadata → search) complete. Graph build
 * continues in the background and is shown as informational progress only.
 *
 * Accessibility: rotating stage text is announced via aria-live="polite".
 * Honours prefers-reduced-motion (no pulse animation).
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Warm-up fields  → keep in sync with WarmupStatus (lib/types.ts) and
 *                   GET /api/v1/system/warmup (api/routers/system.py).
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { useWarmup } from '../../lib/queries';
import type { WarmupStatus } from '../../lib/types';

const SPLASH_TIMEOUT_MS = 180_000;

interface Stage {
  key: keyof Pick<WarmupStatus, 'metadataReady' | 'searchReady' | 'graphReady'>;
  labelKey: string;
  blocksEntry: boolean;
}

const STAGES: Stage[] = [
  { key: 'metadataReady', labelKey: 'splash.stages.metadata', blocksEntry: true },
  { key: 'searchReady', labelKey: 'splash.stages.search', blocksEntry: true },
  { key: 'graphReady', labelKey: 'splash.stages.graph', blocksEntry: false },
];

function activeStage(warmup: WarmupStatus | undefined): Stage | null {
  if (!warmup) return STAGES[0];
  return STAGES.find((s) => !warmup[s.key]) ?? null;
}

function coreStagesReady(warmup: WarmupStatus | undefined): boolean {
  return Boolean(warmup?.metadataReady && warmup?.searchReady);
}

function resolveErrorMessage(code: string | null, t: TFunction): string {
  if (!code) return t('splash.errors.generic');
  const key = `splash.errors.${code}`;
  const translated = t(key);
  return translated === key ? t('splash.errors.generic') : translated;
}

export function SplashGate({ children }: { children: React.ReactNode }) {
  const { data: warmup, isError } = useWarmup();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), SPLASH_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const forceEnter = timedOut && coreStagesReady(warmup);
  if (warmup?.ready || forceEnter) return <>{children}</>;

  const backendDown = isError && !warmup;

  return (
    <Splash
      warmup={warmup}
      backendDown={backendDown}
      blockingError={!backendDown && warmup?.error != null}
      timedOut={timedOut}
    />
  );
}

function Splash({
  warmup,
  backendDown,
  blockingError,
  timedOut,
}: {
  warmup: WarmupStatus | undefined;
  backendDown: boolean;
  blockingError: boolean;
  timedOut: boolean;
}) {
  const { t } = useTranslation();
  const current = activeStage(warmup);
  const resolvedError = useMemo(
    () => resolveErrorMessage(warmup?.error ?? null, t),
    [warmup?.error, t],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background text-foreground"
      role="status"
    >
      <h1 className="text-3xl font-semibold tracking-tight">LexFlow</h1>

      {backendDown ? (
        <SplashBackendDown />
      ) : blockingError ? (
        <SplashError message={resolvedError} timedOut={timedOut} />
      ) : (
        <>
          <SegmentBar warmup={warmup} t={t} />
          <p className="h-5 text-sm text-muted-foreground" aria-live="polite">
            {current ? t(current.labelKey) : t('splash.preparing')}
          </p>
          {timedOut && (
            <p className="max-w-sm text-center text-xs text-muted-foreground">
              {t('splash.timeoutHelp')}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SegmentBar({
  warmup,
  t,
}: {
  warmup: WarmupStatus | undefined;
  t: (key: string) => string;
}) {
  const current = activeStage(warmup);
  return (
    <div className="flex w-72 gap-1.5" aria-hidden="true">
      {STAGES.map((stage) => {
        const done = warmup?.[stage.key] ?? false;
        const isActive = current?.key === stage.key;
        return (
          <div
            key={stage.key}
            className={[
              'h-1.5 flex-1 overflow-hidden rounded-full bg-muted',
              stage.blocksEntry ? '' : 'opacity-70',
            ].join(' ')}
            title={stage.blocksEntry ? undefined : t('splash.stages.graphOptional')}
          >
            <div
              className={[
                'h-full rounded-full bg-primary transition-all duration-500',
                done ? 'w-full' : isActive ? 'w-1/2 motion-safe:animate-pulse' : 'w-0',
              ].join(' ')}
            />
          </div>
        );
      })}
    </div>
  );
}

function SplashBackendDown() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        {t('splash.backendDown')}
      </p>
    </div>
  );
}

function SplashError({ message, timedOut }: { message: string; timedOut: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="max-w-sm text-center text-sm text-destructive">{message}</p>
      {timedOut && (
        <p className="max-w-sm text-center text-xs text-muted-foreground">
          {t('splash.timeoutHelp')}
        </p>
      )}
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        {t('splash.retry')}
      </button>
    </div>
  );
}
