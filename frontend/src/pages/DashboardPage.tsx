import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Tabs } from '@/components/ui';
import { Skeleton } from '@/components/domain/Skeleton';
import { useDashboard } from '@/lib/queries';
import { BigChart } from '@/pages/dashboard/BigChart';
import { DashCard } from '@/pages/dashboard/DashCard';

type DashboardPreset = 'compliance' | 'analytics';
const VALID_PRESETS: DashboardPreset[] = ['compliance', 'analytics'];

function asPreset(raw: string | undefined): DashboardPreset {
  return VALID_PRESETS.includes(raw as DashboardPreset) ? (raw as DashboardPreset) : 'compliance';
}

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { preset: presetParam } = useParams<{ preset?: string }>();
  const [preset, setPreset] = useState<DashboardPreset>(asPreset(presetParam));
  useEffect(() => {
    const next = asPreset(presetParam);
    if (next !== preset) setPreset(next);
  }, [presetParam, preset]);
  const handleTabChange = (v: string) => {
    const next = asPreset(v);
    setPreset(next);
    navigate(`/dashboards/${next}`);
  };
  const { data, isLoading } = useDashboard(preset);

  return (
    <div className="h-full max-w-content overflow-auto px-5 md:px-8 py-6 scrollbar-thin">
      <div className="mb-5 flex flex-wrap items-baseline gap-3">
        <h1 className="font-display text-2xl font-semibold">{t('dashboards.title')}</h1>
        <Tabs
          variant="segmented"
          value={preset}
          onChange={handleTabChange}
          tabs={[
            { id: 'compliance', label: t('dashboards.tabs.compliance') },
            { id: 'analytics', label: t('dashboards.tabs.analytics') },
          ]}
        />
      </div>

      {(!data || isLoading) ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.cards.map((c) => <DashCard key={c.id} card={c} />)}
          </div>

          <Card className="p-5">
            <div className="mb-1 flex items-baseline gap-2">
              <h3 className="font-display text-base font-semibold">{t('dashboards.chartTitle')}</h3>
              <span className="text-[12px] text-muted">{t('dashboards.chartSubtitle')}</span>
            </div>
            <BigChart values={data.series.values} labels={data.series.labels} recentFrom={data.series.recentFrom} />
          </Card>
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy>
      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-3 w-7/12" />
            <div className="mt-2 flex items-baseline gap-2">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="mt-3 h-12 w-full" />
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <div className="mb-3 flex items-baseline gap-2">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-72 w-full" />
      </Card>
    </div>
  );
}
